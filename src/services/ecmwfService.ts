import fs, { ReadStream } from 'fs';
import { promisify } from 'util';
import * as stream from 'stream';
import path from 'path';

import axios, { AxiosResponse } from 'axios';

import logger from '../logger';
import { makeDirectory } from '../utils/fileSystem';

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
  for (let i = 9; i <= 18; i += 3) {
    filesToDownload.push({
      hour: i,
      url: parsedUrl.replaceAll('{{FORECAST}}', String(i)),
    });
  }

  const folder = path.resolve(__dirname, '../../operating_folder');
  try {
    await fs.promises.access(folder);
  } catch (error) {
    await makeDirectory(folder);
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
          forecastTime: `${downloadYear}-${downloadMonth}-${downloadDay}T${String(
            hour,
          ).padStart(2, '0')}:00:00.000Z`,
          file: filePath,
        };
      } catch (error) {
        logger.error(`Failed to download ${url} to local file`);
        return null;
      }
    }),
  );
  return downloadResult;
}

export { downloadECMWFFile };
