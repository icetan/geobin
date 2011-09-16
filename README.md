geobin
======

Fire up your terminal and type:

> git clone https://github.com/icetan/geobin.git
>
> cd geobin
>
> npm install
>
> npm start

Don't forget to start your MongoDB server. You can configure your store
connection in settings.json and also some other stuff.

To try out the API, open client/index.html with your favorite browser and just
press the *Log Position* button. This will store your position in your MongoDB
with some extra meta data.

What?
-----
This is a simple way of logging geospatial points over a RESTful API using
GeoJSON and OAuth2 authentication. It uses a MongoDB storage.

Why?
----
The reason for geobin's existence was born from a need to replace one of our
companies software components. Our so called Position Platform Framework
(useless naming convention alert) was used to collect geospatial point data
from mobile devices. These devices are of different brands and have
different APIs. What PPF (for short) does is just add support for all of these
devices in one single monolithic application with a horrific way of configuring
each unit. So I set out to create a small and simple position logging server
which other small processes totally separate to geobin would use.

I don't even
------------
This is also a experiment for me to try out node.js and a new type of SoA based
on small and very specific services communicating with each other through a
simple API like HTTP and REST.

