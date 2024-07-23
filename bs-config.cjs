module.exports = {
  proxy: "http://127.0.0.1:2368", // replace with your local server URL
  files: [
    "assets/built/**",
    "*.hbs",
    "partials/**/*.hbs"
  ],
  ignore: [],
  port: 3000, // this is the port that browser-sync will use
  reloadDelay: 0,
  browser: "msedge"
};