import fs from 'fs';
import { promisify } from 'util';

const readDirectory = promisify(fs.readdir);
const readFile = promisify(fs.readFile);
const makeDirectory = promisify(fs.mkdir);
const deleteFile = promisify(fs.unlink);

export { readDirectory, readFile, makeDirectory, deleteFile };
