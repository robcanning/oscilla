module.exports = function (eleventyConfig) {

  eleventyConfig.addPassthroughCopy({ "src/style.css": "style.css" });
  eleventyConfig.addPassthroughCopy({ "src/cheatsheet.css": "cheatsheet.css" });
  eleventyConfig.addPassthroughCopy("src/img");
  eleventyConfig.addPassthroughCopy("src/screenshots");
  eleventyConfig.addPassthroughCopy("src/favicon.svg");
  eleventyConfig.addPassthroughCopy("src/**/*.zip");
  eleventyConfig.addPassthroughCopy("src/**/*.scd");
  eleventyConfig.addPassthroughCopy("src/**/*.pd");

  return {
    dir: {
      input: "src",
      includes: "_includes",
      output: "site"
    },

    markdownTemplateEngine: "njk",
    htmlTemplateEngine: "njk",

    // 🔑 THIS IS THE KEY LINE
    pathPrefix: "/oscilla/docs/"
  };
};
