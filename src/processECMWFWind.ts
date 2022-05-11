import dotenv from 'dotenv';
dotenv.config();
import fs from 'fs';
import path from 'path';

import logger from './logger';
import {
  buildVRT,
  downloadECMWFFile,
  generateECMWFWindTiles,
  generateWindParticlePNG,
  splitUVGribs,
} from './services/ecmwfService';
import { uploadFolderToS3, uploadStreamToS3 } from './utils/s3utils';

const today = new Date();
const yesterday = new Date();
yesterday.setDate(yesterday.getDate() - 1);

let selectedDate = today;
let selectedReleaseTime: string | null = null;
if (process.argv[2]) {
  selectedReleaseTime = process.argv[2];
}

if (!selectedReleaseTime) {
  logger.info(
    'No input detected! Deciding release time based on current time:',
  );
  const currentHour = today.getUTCHours();
  if (currentHour >= 7 && currentHour < 19) {
    selectedReleaseTime = '00';
  } else {
    selectedReleaseTime = '12';
    if (currentHour < 7) {
      selectedDate = yesterday;
    }
  }
  logger.info(
    `Selected release time: ${selectedReleaseTime} | Date: ${selectedDate}`,
  );
}

if (!['00', '12'].includes(selectedReleaseTime)) {
  logger.error('No valid release time selected! Exiting...');
  process.exit(1);
}

const shouldGenerateTiles = process.env.ECMWF_GENERATE_TILES === 'true';
(async () => {
  const bucket = process.env.AWS_S3_WIND_BUCKET || '';
  if (!bucket) {
    logger.error('BUCKET NOT SET! Exiting....');
    process.exit(1);
  }
  logger.info(
    `Processing ECMWF Wind data. Release Time selected: ${selectedReleaseTime}`,
  );
  const donwloadResult = await downloadECMWFFile(
    selectedReleaseTime as '00' | '12',
    selectedDate,
  );
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
    const yearPath = String(forecastTime.getUTCFullYear());
    const monthPath = String(forecastTime.getUTCMonth() + 1).padStart(2, '0');
    const datePath = String(forecastTime.getUTCDate()).padStart(2, '0');
    const hourNum = forecastTime.getUTCHours();
    const hourPath = String(hourNum).padStart(2, '0');

    logger.info(
      `Grib splitted, bulding VRT and generating wind particle PNG. Year: ${yearPath}, month: ${monthPath}, date: ${datePath}, hour: ${hourPath}`,
    );

    const vrtFilePath = `${targetFolder}/built_vrt.vrt`;
    const vrtBuilt = await buildVRT({
      uFilePath,
      vFilePath,
      vrtFilePath,
    });
    const tilesFolder = `${targetFolder}/tiles`;
    let tilesCreated = false;
    if (vrtBuilt) {
      const pngFilePath = `${targetFolder}/particle.png`;
      const tifFilePath = `${targetFolder}/wind_data.tif`;
      const { pngGenerated, tifGenerated } = await generateWindParticlePNG({
        vrtFilePath,
        tifFilePath,
        pngFilePath,
      });
      if (pngGenerated) {
        logger.info('Uploading particle PNG');
        for (let inc = 0; inc < 3; inc++) {
          // Duplicating the png to each hour
          const pngHourPath = String(hourNum + inc).padStart(2, '0');
          try {
            const { uploadPromise, writeStream } = uploadStreamToS3(
              bucket,
              `${yearPath}/${monthPath}/${datePath}/${pngHourPath}/wind_data.png`,
            );
            fs.createReadStream(pngFilePath).pipe(writeStream);
            const uploadResult = await uploadPromise;
            logger.info(`Uploaded PNG: ${uploadResult.Location}`);
          } catch (error) {
            logger.error(
              `Error uploading wind data png (+${inc}): ${
                error instanceof Error ? error.message : '-'
              }`,
            );
          }
        }
      }
      if (shouldGenerateTiles && tifGenerated) {
        logger.info('Generating tiles');
        //Generate the tiles
        tilesCreated = await generateECMWFWindTiles({
          tifFilePath,
          outputFolder: tilesFolder,
        });
      }
    }

    if (shouldGenerateTiles && tilesCreated) {
      logger.info('Uploading tiles');
      // Upload all the tiles to s3 based on the zoom level
      try {
        await uploadFolderToS3(tilesFolder, {
          bucket,
          basePath: `${yearPath}/${monthPath}/${datePath}/${hourPath}`,
        });
      } catch (error: any) {
        logger.error(`Failed to upload tiles to s3. Error: ${error.message}`);
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
