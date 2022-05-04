import dotenv from 'dotenv';
dotenv.config();
import fs from 'fs';
import path from 'path';

import logger from './logger';
import {
  buildVRT,
  downloadECMWFFile,
  generateWindParticlePNG,
  splitUVGribs,
} from './services/ecmwfService';

(async () => {
  logger.info('WINDMAP TILES GENERATOR');
  const today = new Date();
  const yesterday = new Date();
  yesterday.setDate(today.getDate() - 1);
  const donwloadResult = await downloadECMWFFile('12', yesterday);
  console.log(donwloadResult);
  for (let { file, forecastTime } of donwloadResult) {
    const folderName = file.replace('.grib', '');
    const targetFolder = path.resolve(
      __dirname,
      `../operating_folder/${folderName}`,
    );
    try {
      await fs.promises.access(targetFolder);
    } catch (error) {
      await fs.promises.mkdir(targetFolder);
    }

    const { isSuccess, uFilePath, vFilePath } = await splitUVGribs(
      file,
      targetFolder,
    );

    // Delete ecmwf original file regardless
    fs.unlink(file, (err) => {
      if (err) {
        logger.error(`Failed to delete ${file}`);
      } else {
        logger.info(`${file} was deleted`);
      }
    });

    if (!isSuccess) {
      continue;
    }
    const vrtFilePath = `${targetFolder}/built_vrt.vrt`;
    const vrtBuilt = await buildVRT({
      uFilePath,
      vFilePath,
      vrtFilePath,
    });
    if (vrtBuilt) {
      const pngFilePath = `${targetFolder}/particle.png`;
      await generateWindParticlePNG(vrtFilePath, pngFilePath);
      // TODO: Upload the particle png to s3
    }
    // Delete the folder
    // try {
    //   fs.promises.rm(targetFolder, { recursive: true });
    // } catch (error: any) {
    //   logger.error(`Error while cleaning up operation: ${error.message}`);
    // }
  }
})();
