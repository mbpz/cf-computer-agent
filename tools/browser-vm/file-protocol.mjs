// Shared bounded Worker contract. Errors contain codes only, never file contents.
export const DOWNLOAD_CHUNK_SIZE = 1024 * 1024;
export const TEXT_LIMIT = 1024 * 1024, UPLOAD_LIMIT = 20 * TEXT_LIMIT;
export const FILE_ERRORS = new Set(['INVALID_PATH','FILE_NOT_FOUND','FILE_EXISTS','FILE_IN_USE','NOT_DIRECTORY','NOT_FILE',
  'SYMLINK_ESCAPE','SYMLINK_LOOP','UNSUPPORTED_FILESYSTEM','INVALID_PAGE','FILE_TOO_LARGE','NOT_UTF8',
  'FILE_CONFLICT','NO_SPACE','INVALID_FILE','DIRECTORY_NOT_EMPTY','FILE_RENAME_FAILED',
  'INVALID_FILE_OPERATION','FILE_DOWNLOAD_EXPIRED','FILES_CLOSED','FILES_BUSY','FILE_OPERATION_FAILED']);
const encoder = new TextEncoder();
const object = value => value && Object.getPrototypeOf(value) === Object.prototype;
const path = value => typeof value === 'string' && value.length <= 4096 && encoder.encode(value).length <= 4096;
export function copyFileRequest(value) {
  const keys = {list:['page','pageSize'],readText:[],download:[],downloadBegin:[],downloadChunk:['token','offset'],downloadEnd:['token'],mkdir:[],remove:[],rename:['destination'],saveText:['version','text'],upload:['bytes']}[value?.op];
  if (!object(value) || !keys || !path(value.path) || Object.keys(value).some(key => !['op','path',...keys].includes(key))) throw Error('INVALID_FILE_OPERATION');
  if (['downloadChunk','downloadEnd'].includes(value.op) && (typeof value.token !== 'string' || !value.token.length || value.token.length > 128)) throw Error('INVALID_FILE_OPERATION');
  if (value.op === 'downloadChunk' && (!Number.isSafeInteger(value.offset) || value.offset < 0)) throw Error('INVALID_FILE_OPERATION');
  if (value.op === 'saveText' && (typeof value.version !== 'string' || !value.version.length || value.version.length > 128)) throw Error('FILE_CONFLICT');
  if (value.op === 'saveText' && (typeof value.text !== 'string' || value.text.length > TEXT_LIMIT || encoder.encode(value.text).length > TEXT_LIMIT)) throw Error('FILE_TOO_LARGE');
  if (value.op === 'rename' && !path(value.destination)) throw Error('INVALID_PATH');
  if (value.op === 'upload') {
    if (!(value.bytes instanceof Uint8Array)) throw Error('INVALID_FILE');
    if (value.bytes.byteLength > UPLOAD_LIMIT) throw Error('FILE_TOO_LARGE');
    return {...value,bytes:new Uint8Array(value.bytes)};
  }
  return {...value};
}
export function validFileResult(input,value) {
  if (!object(value)) return false;
  if (input.op === 'downloadBegin') return typeof value.token === 'string' && value.token.length > 0 && value.token.length <= 128 && Number.isSafeInteger(value.size) && value.size >= 0 && value.chunkSize === DOWNLOAD_CHUNK_SIZE;
  if (input.op === 'downloadChunk') return value.offset === input.offset && value.bytes instanceof Uint8Array && value.bytes.byteLength <= DOWNLOAD_CHUNK_SIZE && typeof value.done === 'boolean';
  if (input.op === 'readText') return typeof value.text === 'string' && value.text.length <= TEXT_LIMIT && encoder.encode(value.text).length <= TEXT_LIMIT
    && typeof value.version === 'string' && value.version.length > 0 && value.version.length <= 128;
  if (input.op === 'download') return value.bytes instanceof Uint8Array && value.bytes.byteLength <= UPLOAD_LIMIT;
  if (input.op !== 'list') return value.ok === true;
  return path(value.path) && [20,50,100].includes(value.pageSize)
    && Number.isSafeInteger(value.total) && value.total >= 0 && Number.isSafeInteger(value.pages) && value.pages === Math.max(1,Math.ceil(value.total/value.pageSize))
    && Number.isSafeInteger(value.page) && value.page >= 1 && value.page <= value.pages
    && Array.isArray(value.entries) && value.entries.length <= value.pageSize
    && value.entries.every(entry => object(entry) && typeof entry.name === 'string' && encoder.encode(entry.name).length <= 255
      && ['file','directory','symlink','unsupported'].includes(entry.type) && Number.isSafeInteger(entry.bytes) && entry.bytes >= 0);
}
