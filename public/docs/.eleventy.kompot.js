module.exports = function (eleventyConfig) {

  // Same passthroughs as in-app docs
  eleventyConfig.addPassthroughCopy("src/img");
  eleventyConfig.addPassthroughCopy("src/style.css");
  eleventyConfig.addPassthroughCopy("src/cheatsheet.css");
  eleventyConfig.addPassthroughCopy("src/favicon.svg");
  eleventyConfig.addPassthroughCopy("src/**/*.zip");
  eleventyConfig.addPassthroughCopy("src/**/*.scd");
  eleventyConfig.addPassthroughCopy("src/**/*.pd");

  return {
    dir: {
      input: "src",
      includes: "_includes",
      output: "../../kompot_docs/docs"    // ← Put docs in /docs/ subdirectory
    },

    // Kompot mirror serves docs at /docs/
    pathPrefix: "/docs/",                 // ← Important!

    markdownTemplateEngine: "njk",
    htmlTemplateEngine: "njk"
  };
};