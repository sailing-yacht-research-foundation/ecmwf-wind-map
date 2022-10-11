# ecmwf-wind-map

Script to generate wind particle source images and tiles, upload to s3 and serve with cloudfront

---

- [ecmwf-wind-map](#ecmwf-wind-map)
  - [Description](#description)
  - [Installation](#installation)
  - [Usage](#usage)
  - [Deployment](#deployment)

## Description

The main objective of this project is to download the ECMWF forecast data, convert it into a PNG that stores U & V wind components data into the RGB Channel that can be used by the deck.gl website to animate the wind animations. When the forecast data is available, it will download only data going out to the future time that we need, processing enough time data to get us to the next release.

## Installation

To run this directly, you will need to install various tools (e.g. wgrib2, gdal, etc)
1. Clone this repository
2. Run `npm install` to install the dependencies

or via docker:

1. Run `docker build -t ecmwf_wind_map:1.0 .` to build the docker image
2. Run `docker run -it --mount type=bind,source=$(pwd),target=/data ecmwf_wind_map:1.0 /bin/bash` in the project folder

## Usage

Run `ts-node src/procesECMWFWind.ts [RELEASE_TIME]` to start parsing. Make sure RELEASE TIME is either 00 or 12. 
The steps taken to generate the wind particle PNG:

1. Download the `ECMWF gribs` forecasts from 9h-18h (forecast 9 hour to 18 hour ahead) which estimated will be available at 0700 UTC & 1900 UTC.
2. Using `wgrib2`, split downloaded gribs into a U-component grib & V-component grib
3. Using [`gdal`](https://gdal.org/programs/gdalbuildvrt.html), build a VRT (Virtual Dataset) from both component grib, output as `EPSG:4326`
4. Using [`gdal`](https://gdal.org/programs/gdal_translate.html), convert the values into geo-TIFF image, storing the U & V values in the RGB channel.
5. Convert the generated geo-TIFF image into PNG using [`ImageMagick`](https://imagemagick.org/index.php)'s convert.
5. Upload the generated PNGs into S3.

## Deployment

Run terraform deployments with this command:

- `docker-compose -f deployment/docker-compose.yml --env-file deployment/.env run --rm terraform [apply/fmt/destroy/plan]`

The service is currently deployed in AWS `ECS` as a Schedule Task in the `Scraper Runner` cluster, set to run at 07:30 UTC & 19:30 UTC.