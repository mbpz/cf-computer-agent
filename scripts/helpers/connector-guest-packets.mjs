// Independent wire fixtures. Expected protocol fields are asserted literally.
export function checksum(b){let n=0;for(let i=0;i<b.length;i+=2)n+=(b[i]<<8)+(b[i+1]||0);while(n>>>16)n=(n&65535)+(n>>>16);return (~n)&65535;}
function packet(mac,protocol,body,dest=[192,168,86,1]){
 const b=Buffer.alloc(34+body.length);Buffer.from('525400010203','hex').copy(b);Buffer.from(mac).copy(b,6);b.writeUInt16BE(0x800,12);b[14]=0x45;b.writeUInt16BE(20+body.length,16);b[22]=64;b[23]=protocol;Buffer.from([192,168,86,100]).copy(b,26);Buffer.from(dest).copy(b,30);b.writeUInt16BE(checksum(b.subarray(14,34)),24);body.copy(b,34);return b;
}
export function dns(mac,name='github.com',type=1){
 const q=Buffer.concat([Buffer.from('123401000001000000000000','hex'),...name.split('.').map(s=>Buffer.concat([Buffer.from([s.length]),Buffer.from(s)])),Buffer.from([0,0,type,0,1])]);
 const u=Buffer.alloc(8);u.writeUInt16BE(12000);u.writeUInt16BE(53,2);u.writeUInt16BE(q.length+8,4);return packet(mac,17,Buffer.concat([u,q]));
}
export function tcp(mac,{port=443,seq=100,ack=0,flags=2,data='',dest=[140,82,112,3],source=12001}={}){
 const payload=Buffer.from(data),h=Buffer.alloc(20);h.writeUInt16BE(source);h.writeUInt16BE(port,2);h.writeUInt32BE(seq,4);h.writeUInt32BE(ack,8);h[12]=0x50;h[13]=flags;h.writeUInt16BE(64240,14);
 const pseudo=Buffer.from([192,168,86,100,...dest,0,6,0,0]);pseudo.writeUInt16BE(20+payload.length,10);const b=packet(mac,6,Buffer.concat([h,payload]),dest);b.writeUInt16BE(checksum(Buffer.concat([pseudo,h,payload])),50);return b;
}

export function arp(mac){
 const b=Buffer.alloc(42);b.fill(255,0,6);Buffer.from(mac).copy(b,6);b.writeUInt16BE(0x806,12);b.writeUInt16BE(1,14);b.writeUInt16BE(0x800,16);b[18]=6;b[19]=4;b.writeUInt16BE(1,20);Buffer.from(mac).copy(b,22);Buffer.from([192,168,86,100]).copy(b,28);Buffer.from([192,168,86,1]).copy(b,38);return b;
}
export function dhcp(mac,dest=[255,255,255,255]){
 const boot=Buffer.alloc(244);boot[0]=1;boot[1]=1;boot[2]=6;boot.writeUInt32BE(0x12345678,4);Buffer.from(mac).copy(boot,28);boot.writeUInt32BE(0x63825363,236);boot.set([53,1,1,255],240);
 const u=Buffer.alloc(8);u.writeUInt16BE(68);u.writeUInt16BE(67,2);u.writeUInt16BE(8+boot.length,4);const b=packet(mac,17,Buffer.concat([u,boot]),dest);b.fill(0,26,30);b.writeUInt16BE(0,24);b.writeUInt16BE(checksum(b.subarray(14,34)),24);return b;
}
