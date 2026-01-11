module.exports = function (eleventyConfig) {

  eleventyConfig.addPassthroughCopy("src/style.css");
  eleventyConfig.addPassthroughCopy("src/cheatsheet.css");


  return {
    dir: {
      input: "src",
      output: "site",
      includes: "_includes",
      layouts: "_includes"
    },
    pathPrefix: "/oscilla",
    markdownTemplateEngine: "njk",
    htmlTemplateEngine: "njk"
  };
};
