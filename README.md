# ecmwf-wind-map

Script to generate wind particle source images and tiles, upload to s3 and serve with cloudfront

---

- [ecmwf-wind-map](#ecmwf-wind-map)
  - [Installation](#installation)
  - [Running](#running)
    - [Regular Mode](#regular-mode)
    - [Recalculate Mode](#recalculate-mode)

## Installation

1. Run `docker build -t ecmwf_wind_map:1.0 .` to build the docker image
2. Run `docker run -it --mount type=bind,source=$(pwd),target=/data ecmwf_wind_map:1.0 /bin/bash` in the project folder

## Running

1. Once you've ssh into the docker container, run `ts-node src/procesECMWFWind.ts [RELEASE_TIME]` to start parsing. Make sure RELEASE TIME is either 00 or 12.

TODOS:

- Config the terraform deployments for this script (ECS Scheduled task)
- Research and implement cloudfront cdn
- simple Deck.gl web app (We have this one already if using pure js is accepted, I'm using the pure-js sample from deck gl repo to add particle effect)

Info about this project:
https://docs.google.com/document/d/1clQ2pBx-HviaN2O1543lAYdXWydIDBH9vKVzsK9xmCw/edit

Goal:
The goal of this ticket is to add wind direction and speed information to the mobile app.
Because Mapbox does not support vector (spatial vector) streamlet animations, we will have to “hack it”. Rather than include the wind direction information as a layer in the existing map in the mobile app, we will create a website that has a transparent background, and that uses Deck.gl to render the wind animations. This website will be rendered in a mobile app WebView that overlays the existing Mapbox view. It will intercept touch events, update it’s view, and pass the touch events through to the layer beneath it. In that way, we can keep the Mapbox map and the wind map view in sync, so that they move, pan, zoom and scale in lock-step with one another. There is no requirement to visualize any wind that is further in the future than “now”. In other words, we only need to process enough of a forecast to get us from the forecasts available time + processing, to the next forecast available time + processing. The app will not have a way to visualize wind past “now”, but “now” will change of course.

We can break this ticket into three large pieces: creating the tiles, creating the web service, and adding the overlay view to the mobile app.

Creating the tiles:
The tiles will only be created from the ECMWF forecasts. We will need to generate tiles for every forecast run that becomes available. We will only need to use the U and V wind components of the forecast, and we will only need to use enough time slices of the forecast to get us to the next available forecast (plus the tile processing time for the next available forecast). In other words, we only need to process enough time data to get us to the next available tile set.

The logic is as follows:
When the forecast data is available, download only the U and V data going out to the future time that we need. Use the highest spatial and time resolution available.
For each time slice (ideally this would be done as much in parallel as possible):
Use the gdal commands mentioned here: https://github.com/weatherlayers/deck.gl-particle to encode the U,V data into a GeoTiff image of the whole world for that time slice.
Google for a “raster vector tile generator” (gdal, Tippecanoe, maybe a python package). Use this tool to generate a raster tile set for that timeslice. Upload the tileset for that time slice to a CDN with a URL that would make sense for it’s hour slice and that would work for a raster tile library, for instance myurl/2022/04/25/19/x/y/z.png, where the 19 is the 19th hour of April 25th, in UTC. That way the webapp service will always know the url for the “now” time slice.

Running the map website:
Create a very simple Deck.gl web app. It can be completely independent of all SYRF.io features. It should have a transparent CSS background and all features transparent, except the styling of the windlets. It should use Deck.gl and the https://github.com/weatherlayers/deck.gl-particle plugin to render wind particles. You can inspect the source of http://chart-tiles.s3-website-us-east-1.amazonaws.com/deckgl.html to see a simple example of using Deck.gl without React. It may be helpful to include a “base map” to help you test, but in the final service we won’t use it. You should extensively test this map page in mobile browsers to make sure it works.

Adding the map to the mobile app:
Sergij and Radu will be responsible for adding this map as a layer over the existing map, and keeping them in sync.

Additional thoughts:
If we can get this to work well with the ECMWF wind, the next step would be in do it with RTOFS.
