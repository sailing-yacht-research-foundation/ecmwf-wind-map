
FROM ubuntu:18.04
RUN apt-get update && apt-get install -y --no-install-recommends apt-utils
RUN apt-get install software-properties-common -y
RUN add-apt-repository ppa:ubuntugis/ppa

# Install libraries for wgrib2 and gdal tools
RUN apt-get update && apt-get install -y wget \
    build-essential \
    gfortran \
    zlib1g-dev \
    python3.6-dev \
    binutils \
    libproj-dev \
    gdal-bin \
    python-gdal \
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

WORKDIR /data

# Use bin bash for now. Later should run script directly
CMD [ "/bin/bash" ]