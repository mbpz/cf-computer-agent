// Fixed development acceptance commands; no user-supplied shell fragments.
async function checked(command,text){const result=await command(text);if(result.exitCode!==0)throw Error(`Guest command failed (${result.exitCode}): ${text}\n${result.output}`);return result.output.trim();}
export async function acceptPackages(command){
 await checked(command,'apk update');await checked(command,'apk add --no-cache git curl');
 const gitVersion=await checked(command,'git --version'),curlVersion=(await checked(command,'curl --version')).split('\n')[0];
 if(!/^git version \d+\.\d+/.test(gitVersion)||!/^curl \d+\.\d+/.test(curlVersion))throw Error('Unexpected installed version');
 return {gitVersion,curlVersion};
}
export async function acceptGit(command){
 await checked(command,'git -c http.sslVerify=true clone --depth 1 --single-branch --quiet https://github.com/octocat/Hello-World.git /tmp/lc-repo');
 const commitBeforeFetch=await checked(command,'git -C /tmp/lc-repo rev-parse HEAD');
 if(!/^[a-f0-9]{40}$/.test(commitBeforeFetch))throw Error('Invalid clone commit');
 await checked(command,'git -C /tmp/lc-repo -c http.sslVerify=true fetch --quiet origin');
 const commitAfterFetch=await checked(command,'git -C /tmp/lc-repo rev-parse FETCH_HEAD');
 if(!/^[a-f0-9]{40}$/.test(commitAfterFetch))throw Error('Invalid fetched commit');
 const api=await checked(command,"curl --fail --silent --show-error --max-time 25 --output /tmp/lc-api.json --write-out '%{http_code}\\n' https://api.github.com/repos/octocat/Hello-World && cat /tmp/lc-api.json");
 let identity;try{identity=JSON.parse(api.slice(api.indexOf('\n')+1)).full_name;}catch{}
 if(api.split('\n')[0]!=='200'||identity!=='octocat/Hello-World')throw Error('Invalid API status or repository identity');
 return {commitBeforeFetch,commitAfterFetch,apiStatus:200,apiRepository:identity};
}
