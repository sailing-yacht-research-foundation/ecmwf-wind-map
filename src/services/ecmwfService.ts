import fs, { ReadStream } from 'fs';
import { promisify } from 'util';
import * as stream from 'stream';
import path from 'path';
import { exec } from 'child_process';

import axios, { AxiosResponse } from 'axios';

import logger from '../logger';

const execPromise = promisify(exec);
const availableTimes = {
  '00': '07:05',
  '12': '19:05',
};
const baseDownloadUrl =
  'https://data.ecmwf.int/forecasts/{{YEAR}}{{MONTH}}{{DAY}}/{{RELEASE_TIME}}z/0p4-beta/oper/{{YEAR}}{{MONTH}}{{DAY}}{{RELEASE_TIME}}0000-{{FORECAST}}h-oper-fc.grib2';

const finishedDownload = promisify(stream.finished);

const isToday = (checkDate: Date) => {
  const today = new Date();
  return (
    checkDate.getUTCDate() == today.getUTCDate() &&
    checkDate.getUTCMonth() == today.getUTCMonth() &&
    checkDate.getUTCFullYear() == today.getUTCFullYear()
  );
};
// Accepting releaseDate in this function for easier testing, in general, releaseDate will always be today's date
// The files are available after 7 UTC and 19 UTC, which will require long waiting time when developing in UTC+7
async function downloadECMWFFile(releaseTime: '00' | '12', releaseDate: Date) {
  const availableTime = Number(availableTimes[releaseTime].replace(':', ''));
  const downloadDay = String(releaseDate.getUTCDate()).padStart(2, '0');
  const downloadMonth = String(releaseDate.getUTCMonth() + 1).padStart(2, '0');
  const downloadYear = String(releaseDate.getUTCFullYear());
  const downloadHour = releaseDate.getUTCHours();
  const downloadMinute = releaseDate.getUTCMinutes();
  if (isToday(releaseDate)) {
    const currentTime = Number(`${downloadHour}${downloadMinute}`);
    if (currentTime < availableTime) {
      throw new Error(
        `Weather files are not available yet, try again after ${availableTimes[releaseTime]}`,
      );
    }
  }

  // Download only the forecast for 9h - 18h. This should cover until the next available release
  const filesToDownload: { hour: number; url: string }[] = [];
  const parsedUrl = baseDownloadUrl
    .replaceAll('{{YEAR}}', downloadYear)
    .replaceAll('{{MONTH}}', downloadMonth)
    .replaceAll('{{DAY}}', downloadDay)
    .replaceAll('{{RELEASE_TIME}}', releaseTime);
  for (let i = 9; i <= 9; i += 3) {
    filesToDownload.push({
      hour: i,
      url: parsedUrl.replaceAll('{{FORECAST}}', String(i)),
    });
  }

  const folder = path.resolve(__dirname, '../../operating_folder');
  try {
    await fs.promises.access(folder);
  } catch (error) {
    await fs.promises.mkdir(folder);
  }

  const downloadResult = await Promise.all(
    filesToDownload.map(async (file) => {
      const { hour, url } = file;
      const filePath = `${folder}/ecmwf_${downloadYear}_${downloadMonth}_${downloadDay}_${releaseTime}_${hour}.grib`;
      try {
        const writableStream = fs.createWriteStream(filePath);
        const response: AxiosResponse<ReadStream> = await axios.get(url, {
          responseType: 'stream',
        });
        const { data } = response;
        data.pipe(writableStream);
        await finishedDownload(data);
        return {
          forecastTime: new Date(
            `${downloadYear}-${downloadMonth}-${downloadDay}T${String(
              hour,
            ).padStart(2, '0')}:00:00.000Z`,
          ),
          file: filePath,
        };
      } catch (error) {
        logger.error(`Failed to download ${url} to local file`);
        return null;
      }
    }),
  );
  return downloadResult.filter((row) => row != null) as {
    forecastTime: Date;
    file: string;
  }[];
}

async function splitUVGribs(sourceFile: string, targetFolder: string) {
  let isSuccess = false;
  const uFilePath = path.resolve(`${targetFolder}/u.grib`);
  const vFilePath = path.resolve(`${targetFolder}/v.grib`);
  try {
    await execPromise(
      `wgrib2 ${sourceFile} -match ":UGRD:10 m above ground:" -grib_out ${uFilePath}`,
    );
    await execPromise(
      `wgrib2 ${sourceFile} -match ":VGRD:10 m above ground:" -grib_out ${vFilePath}`,
    );
    isSuccess = true;
  } catch (error) {
    logger.error(`Error splitting grib to U & V gribs`);
  }
  return {
    isSuccess,
    uFilePath,
    vFilePath,
  };
}

async function buildVRT(params: {
  uFilePath: string;
  vFilePath: string;
  vrtFilePath: string;
}) {
  const { uFilePath, vFilePath, vrtFilePath } = params;
  let isSuccess = false;
  try {
    await execPromise(
      `gdalbuildvrt -separate ${vrtFilePath} ${uFilePath} ${vFilePath} -a_srs EPSG:4326`,
    );
    isSuccess = true;
  } catch (error) {
    logger.error(`Error building VRT`);
  }

  return isSuccess;
}

async function generateWindParticlePNG(data: {
  vrtFilePath: string;
  pngFilePath: string;
  tifFilePath: string;
}) {
  let tifGenerated = false;
  let pngGenerated = false;
  const { vrtFilePath, pngFilePath, tifFilePath } = data;
  try {
    await execPromise(
      `gdal_translate -ot Byte -a_nodata 0 -outsize 1440 720 -b 1 -b 2 -b 2 -scale -128 127 0 255 ${vrtFilePath} ${tifFilePath}`,
    );
    tifGenerated = true;
    await execPromise(`convert ${tifFilePath} ${pngFilePath}`);
    pngGenerated = true;
  } catch (error) {
    logger.error(`Error generating windlet particle PNG`);
  }

  return { tifGenerated, pngGenerated };
}

async function generateECMWFWindTiles(data: {
  tifFilePath: string;
  outputFolder: string;
}) {
  const { tifFilePath, outputFolder } = data;
  let isSuccess = false;
  try {
    await execPromise(
      `gdal2tiles.py --xyz --zoom=0-7 --processes=2 -e --profile=mercator ${tifFilePath} ${outputFolder}`,
    );
    isSuccess = true;
  } catch (error) {
    logger.error(`Error generating wind data tiles`);
  }

  return isSuccess;
}
export {
  downloadECMWFFile,
  splitUVGribs,
  buildVRT,
  generateWindParticlePNG,
  generateECMWFWindTiles,
};
