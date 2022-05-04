import dotenv from 'dotenv';
dotenv.config();
import logger from './logger';
import { downloadECMWFFile } from './services/ecmwfService';

(async () => {
  logger.info('WINDMAP TILES GENERATOR');
  const today = new Date();
  const yesterday = new Date();
  yesterday.setDate(today.getDate() - 1);
  const donwloadResult = await downloadECMWFFile('12', yesterday);
  console.log(donwloadResult);
})();
