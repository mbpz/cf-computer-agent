import { encodeProbeCommand, parseProbeReply } from './serial-protocol.mjs';
import { verifyAlpineArchive } from './alpine-artifact.mjs';
import { sealCheckpoint, restoreCheckpoint } from './probe-checkpoint.mjs';

// Development-only verification. This does not authorize an image for publication.
const encoder = new TextEncoder();
const decoder = new TextDecoder();

async function withDeadline(operation, timeoutMs, label) {
  let timer;
  try {
    return await Promise.race([operation, new Promise((_, reject) => {
      timer = setTimeout(() => reject(new Error(`${label} timed out`)), timeoutMs);
    })]);
  } finally {
    clearTimeout(timer);
  }
}

function waitForEvent(machine, event, timeoutMs) {
  return new Promise((resolveEvent, reject) => {
    const finish = () => {
      clearTimeout(timer);
      machine.remove_listener(event, finish);
      resolveEvent();
    };
    const timer = setTimeout(() => {
      machine.remove_listener(event, finish);
      reject(new Error(`Timed out waiting for ${event}`));
    }, timeoutMs);
    machine.add_listener(event, finish);
  });
}

function waitForSerial(machine, select, timeoutMs, send) {
  return new Promise((resolveReply, reject) => {
    let buffer = '';
    const finish = (error, result) => {
      clearTimeout(timer);
      machine.remove_listener('serial0-output-byte', receive);
      if (error) reject(error);
      else resolveReply(result);
    };
    const receive = byte => {
      buffer += String.fromCharCode(byte);
      if (buffer.length > 1024 * 1024) {
        finish(new Error('Guest serial output exceeded 1 MiB'));
        return;
      }
      const result = select(buffer);
      if (result !== null) finish(null, result);
    };
    const timer = setTimeout(() => {
      finish(new Error(`Guest serial timed out; last output: ${JSON.stringify(buffer.slice(-512))}`));
    }, timeoutMs);
    machine.add_listener('serial0-output-byte', receive);
    try { send?.(); } catch (error) { finish(error); }
  });
}

async function execute(machine, command, timeoutMs) {
  const id = Array.from(crypto.getRandomValues(new Uint8Array(8)), byte => byte.toString(16).padStart(2, '0')).join('');
  return waitForSerial(machine, text => parseProbeReply(text, id), timeoutMs, () => {
    machine.serial0_send(encodeProbeCommand(command, id));
  });
}

async function checked(machine, command, timeoutMs) {
  const result = await execute(machine, command, timeoutMs);
  if (result.exitCode !== 0) throw new Error(`Guest command failed (${result.exitCode}): ${command}; output: ${JSON.stringify(result.output.slice(0,1024))}`);
  return result.output.trim();
}

export async function runMachineProbe({ createMachine, timeoutMs = 30_000, alpineRootfs, image = 'buildroot', bootProfile, network = false, onProgress }) {
  if (typeof createMachine !== 'function' || !Number.isSafeInteger(timeoutMs) || timeoutMs <= 0) {
    throw new Error('An engine factory and positive timeout are required');
  }
  if (!['buildroot', 'alpine-iso'].includes(image)) throw new Error('Unknown image profile');
  const iso = image === 'alpine-iso';
  if (iso && alpineRootfs !== undefined) throw new Error('ISO and chroot options conflict');
  if (iso && !bootProfile?.checkpointIdentity) throw new Error('Verified ISO boot profile required');
  const sharedPath = iso ? '/mnt/work' : '/mnt';
  const alpinePath = iso ? '' : '/tmp/alpine';
  const alpineCommand = iso ? '' : 'chroot /tmp/alpine ';
  let machine;
  let alpine;
  let networkEvidence;
  const phases = [];
  async function measure(stage, operation) {
    const start = performance.now();
    const instructions = machine?.get_instruction_counter?.();
    const report = status => {
      const count = machine?.get_instruction_counter?.();
      // The pinned engine exposes a 32-bit wrapping counter. This delta is
      // diagnostic activity modulo 2^32, not total instructions or CPU usage.
      const progress = { stage, status, elapsedMs: Math.round(performance.now() - start),
        instructions: Number.isFinite(count) && Number.isFinite(instructions) ? (count - instructions) >>> 0 : null };
      if (status !== 'running') phases.push(progress);
      onProgress?.(progress);
    };
    report('running');
    const timer = onProgress ? setInterval(() => report('running'), 1000) : undefined;
    try {
      const result = await operation();
      report('passed');
      return result;
    } catch (error) {
      report('failed');
      throw error;
    } finally { clearInterval(timer); }
  }
  if (network && !alpineRootfs && !iso) throw new Error('Networking verification requires the pinned Alpine rootfs');
  // Never extract unverified bytes, even inside this disposable development guest.
  if (alpineRootfs !== undefined) await verifyAlpineArchive(alpineRootfs);
  const startedAt = performance.now();
  try {
    machine = createMachine();
    await measure('boot', async () => {
      await waitForEvent(machine, 'emulator-ready', timeoutMs);
      // emulator-ready is only host initialization, never Linux readiness.
      const booted = waitForSerial(machine, text => (iso ? /login: $/ : /~% $/).test(text) ? true : null, timeoutMs);
      await machine.run();
      await booted;
      if (iso) {
        await waitForSerial(machine, text => /localhost:~# $/.test(text) ? true : null, timeoutMs, () => machine.serial0_send('root\n'));
        await checked(machine, 'modprobe 9pnet_virtio && modprobe 9p && mkdir -p /mnt/work && mount -t 9p -o trans=virtio,version=9p2000.L host9p /mnt/work', timeoutMs);
      }
    });
    const bootMs = Math.round(performance.now() - startedAt);
    const architecture = await checked(machine, 'uname -m', timeoutMs);
    const kernel = await checked(machine, 'cat /proc/version', timeoutMs);
    const guestTools = await checked(machine, 'for tool in sh busybox curl wget git apk apt-get python3 node openssl; do tool_path=$(command -v "$tool" || true); printf "%s=%s\\n" "$tool" "$tool_path"; done', timeoutMs);
    const guestDate = await checked(machine, 'date -u +%Y-%m-%dT%H:%M:%SZ', timeoutMs);
    const caBundlePresent = (await execute(machine, 'test -s /etc/ssl/certs/ca-certificates.crt', timeoutMs)).exitCode === 0;
    if (alpineRootfs) {
      // This Buildroot tar omits gzip support. Decompress the hash-pinned archive in the host Worker,
      // but extract it only inside the guest; never create archive paths on the host filesystem.
      const unpacked = new Uint8Array(await new Response(new Blob([alpineRootfs]).stream()
        .pipeThrough(new DecompressionStream('gzip'))).arrayBuffer());
      if (unpacked.byteLength !== 7_475_200) throw new Error('Unexpected Alpine tar size');
      await machine.create_file('alpine-rootfs.tar', unpacked);
      await checked(machine, 'mkdir -p /tmp/alpine && tar -xf /mnt/alpine-rootfs.tar -C /tmp/alpine', timeoutMs);
      alpine = {
        release: await checked(machine, 'chroot /tmp/alpine /bin/cat /etc/alpine-release', timeoutMs),
        packageManager: await checked(machine, 'chroot /tmp/alpine /sbin/apk --version', timeoutMs),
        caBundlePresent: (await execute(machine, 'test -s /tmp/alpine/etc/ssl/cert.pem', timeoutMs)).exitCode === 0,
      };
    }
    if (iso) {
      alpine = {
        release: await checked(machine, 'cat /etc/alpine-release', timeoutMs),
        packageManager: await checked(machine, '/sbin/apk --version', timeoutMs),
        caBundlePresent: (await execute(machine, 'test -s /etc/ssl/cert.pem', timeoutMs)).exitCode === 0,
      };
    }
    if (network) {
      // Guest-only setup, fixed public test destinations. The relay maps these
      // synthetic addresses to vetted public DNS results; it never dials them.
      await checked(machine, 'ifconfig eth0 192.168.86.100 netmask 255.255.255.0 up && ip route replace default via 192.168.86.1 dev eth0', timeoutMs);
      await checked(machine, `printf '127.0.0.1 localhost\\n203.0.113.10 dl-cdn.alpinelinux.org\\n203.0.113.11 github.com\\n203.0.113.12 api.github.com\\n' > ${alpinePath}/etc/hosts`, timeoutMs);
      await checked(machine, `printf 'nameserver 192.168.86.1\\n' > ${alpinePath}/etc/resolv.conf`, timeoutMs);
      if (!iso) await checked(machine, 'mount -t proc proc /tmp/alpine/proc && mount -o bind /dev /tmp/alpine/dev', timeoutMs);
      // The ISO's default repository points to its read-only CD. Network tests
      // opt into fixed HTTPS repositories; offline boot never downloads packages.
      if (iso) await checked(machine, "printf 'https://dl-cdn.alpinelinux.org/alpine/v3.24/main\\nhttps://dl-cdn.alpinelinux.org/alpine/v3.24/community\\n' > /etc/apk/repositories", timeoutMs);
      const packageInstall = await measure('packages', () => checked(machine, `${alpineCommand}/sbin/apk add --no-cache git curl`, timeoutMs));
      const gitVersion = await checked(machine, `${alpineCommand}/usr/bin/git --version`, timeoutMs);
      await measure('git', () => checked(machine, `${alpineCommand}/usr/bin/git -c http.sslVerify=true clone --depth 1 --single-branch --quiet https://github.com/octocat/Hello-World.git /tmp/probe-repo`, timeoutMs));
      const gitCommit = await checked(machine, `${alpineCommand}/usr/bin/git -C /tmp/probe-repo rev-parse HEAD`, timeoutMs);
      const apiStatus = await measure('api', () => checked(machine, `${alpineCommand}/usr/bin/curl --fail --silent --show-error --max-time 25 --output /tmp/repo.json --write-out '%{http_code}' https://api.github.com/repos/octocat/Hello-World`, timeoutMs));
      const apiRepository = JSON.parse(await checked(machine, `cat ${alpinePath}/tmp/repo.json`, timeoutMs)).full_name;
      if (apiStatus !== '200' || apiRepository !== 'octocat/Hello-World' || !/^[0-9a-f]{40}$/.test(gitCommit)) {
        throw new Error('Unexpected public HTTPS verification response');
      }
      networkEvidence = { packageInstall, gitVersion, gitCommit, apiStatus, apiRepository };
      if (!iso) await checked(machine, 'umount /tmp/alpine/proc && umount /tmp/alpine/dev', timeoutMs);
    }
    await machine.create_file('host.txt', encoder.encode('vm-host-to-guest'));
    const hostToGuest = await checked(machine, `cat ${sharedPath}/host.txt`, timeoutMs);
    await checked(machine, `printf 'vm-guest-to-host' > ${sharedPath}/guest.txt`, timeoutMs);
    const guestToHost = decoder.decode(await machine.read_file('guest.txt'));
    await checked(machine, "printf 'vm-private-memory-file' > /tmp/private.txt; sync", timeoutMs);
    const commandFailureExitCode = (await execute(machine, 'exit 23', timeoutMs)).exitCode;
    // This test image's root is RAM-backed and the shared 9p FS is in-memory.
    // This is not evidence for a separate writable disk image's dirty blocks.
    await withDeadline(machine.stop(), timeoutMs, 'Engine pause');
    // Declared development configuration, not a signed/publishable asset manifest.
    const checkpointIdentity = iso ? bootProfile.checkpointIdentity : {
      engineVersion: 'v86-0.5.458',
      imageVersion: `buildroot-6.8.12${alpine ? '+alpine-3.24.1-x86' : ''}`,
      memoryBytes: 256 * 1024 * 1024, filesystem: 'ram-root+in-memory-9p',
    };
    const checkpoint = await sealCheckpoint(await machine.save_state(), checkpointIdentity);
    await withDeadline(machine.destroy(), Math.min(timeoutMs, 3000), 'Engine shutdown');
    machine = createMachine();
    await waitForEvent(machine, 'emulator-ready', timeoutMs);
    await restoreCheckpoint(machine, checkpoint, checkpointIdentity);
    const restoredSharedFile = decoder.decode(await machine.read_file('guest.txt'));
    await machine.run();
    const restoredPrivateFile = await checked(machine, 'cat /tmp/private.txt', timeoutMs);
    const restoredCommandOutput = await checked(machine, "printf 'vm-restored-shell'", timeoutMs);
    if (alpine) {
      alpine.restoredRelease = await checked(machine, `${alpineCommand}/bin/cat /etc/alpine-release`, timeoutMs);
      alpine.restoredPackageManager = await checked(machine, `${alpineCommand}/sbin/apk --version`, timeoutMs);
    }
    return {
      networkVerified: Boolean(networkEvidence), ...(networkEvidence ? { network: networkEvidence } : {}),
      architecture, kernel, bootMs, guestTools, guestDate, caBundlePresent, phases,
      hostToGuest, guestToHost, commandFailureExitCode, snapshotBytes: checkpoint.bytes,
      checkpoint: { digestVerified: true, compatibilityVerified: true, sha256: checkpoint.sha256,
        identity: checkpoint.identity, identitySource: iso ? 'verified-boot-bytes+declared-engine-module' : 'declared-development-config', encrypted: false },
      ...(iso ? { bootArtifacts: bootProfile.bootArtifacts } : {}),
      restoredSharedFile, restoredPrivateFile, restoredCommandOutput, ...(alpine ? { alpine } : {}),
    };
  } finally {
    if (machine) await withDeadline(machine.destroy(), Math.min(timeoutMs, 3000), 'Engine shutdown');
  }
}
