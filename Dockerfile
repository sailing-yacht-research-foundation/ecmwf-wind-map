FROM node:16-alpine AS builder
WORKDIR /usr/src/app
COPY ["package*.json", "tsconfig.json",  "./"]
RUN npm ci
COPY ./src ./src
RUN npm run build

FROM osgeo/gdal:ubuntu-small-3.1.0
WORKDIR /data

RUN apt-get update && apt-get install -y --no-install-recommends apt-utils
RUN apt-get install software-properties-common -y

# Install libraries for wgrib2 and gdal tools
RUN apt-get update && apt-get install -y wget \
    curl \
    build-essential \
    gfortran \
    zlib1g-dev \
    imagemagick

# Setting for libraries
ENV CC gcc
ENV FC gfortran

# Download wgrib2
RUN cd ~ \
    && wget ftp://ftp.cpc.ncep.noaa.gov/wd51we/wgrib2/wgrib2.tgz \
    && tar xvzf wgrib2.tgz

# Install wgrib2
RUN cd ~/grib2/ \
    && make \
    && cp wgrib2/wgrib2 /usr/local/bin/wgrib2

RUN curl -fsSL https://deb.nodesource.com/setup_16.x | bash -
RUN apt-get update && apt-get install -y nodejs

COPY package*.json ./
RUN npm install --production --silent
COPY --from=builder /usr/src/app/build/ build/