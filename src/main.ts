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
import uploadStreamToS3 from './utils/uploadStreamToS3';

(async () => {
  const bucket = process.env.AWS_S3_BUCKET || '';
  if (!bucket) {
    logger.error('BUCKET NOT SET! Exiting....');
    process.exit(1);
  }
  logger.info('WINDMAP TILES GENERATOR');
  const today = new Date();
  const yesterday = new Date();
  yesterday.setDate(today.getDate() - 1);
  const donwloadResult = await downloadECMWFFile('12', yesterday);
  console.log(donwloadResult);
  for (let { file, forecastTime } of donwloadResult) {
    const folderName = file.split('operating_folder/')[1].replace('.grib', '');
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
      const pngGenerated = await generateWindParticlePNG(
        vrtFilePath,
        pngFilePath,
      );
      if (pngGenerated) {
        try {
          const yearPath = String(forecastTime.getUTCFullYear());
          const monthPath = String(forecastTime.getUTCMonth() + 1).padStart(
            2,
            '0',
          );
          const datePath = String(forecastTime.getUTCDate()).padStart(2, '0');
          const hourPath = String(forecastTime.getUTCHours()).padStart(2, '0');
          const { uploadPromise, writeStream } = uploadStreamToS3(
            bucket,
            `${yearPath}/${monthPath}/${datePath}/${hourPath}/wind_data.png`,
          );
          fs.createReadStream(pngFilePath).pipe(writeStream);
          await uploadPromise;
        } catch (error) {
          logger.error(
            `Error uploading wind data png: ${
              error instanceof Error ? error.message : '-'
            }`,
          );
        }
      }
    }
    // Delete the folder
    try {
      await fs.promises.rm(targetFolder, { recursive: true });
    } catch (error: any) {
      logger.error(`Error while cleaning up operation: ${error.message}`);
    }
  }
})();
