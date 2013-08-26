/*
Leaflet.miniMaplayerSwitcher building and linting scripts.

To use, install Node, then run the following commands in the project root:

    npm install

This will isntall the required packages as defiend in package.json.

To check the code and build Leaflet.miniMaplayerSwitcher from source, run "jake"
*/

var build = require('./build/build.js');

desc('Check Leaflet.label source for errors with JSHint');
task('lint', build.lint);

desc('Combine and compress Leaflet.miniMaplayerSwitcher source files');
task('build', ['lint'], build.build);

task('default', ['build']);
