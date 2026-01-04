module.exports = function (eleventyConfig) {
  // Copy static assets to the output folder
  eleventyConfig.addPassthroughCopy("assets");
  eleventyConfig.addPassthroughCopy("compositions/**/images/*");
  eleventyConfig.addPassthroughCopy("compositions/**/videos/*");
  eleventyConfig.addPassthroughCopy("compositions/**/supercollider/*");
  eleventyConfig.addPassthroughCopy("compositions/**/oscilla/*");

  return {
    dir: {
      input: ".",
      output: "../docs",
      includes: "_includes"
    },
    markdownTemplateEngine: "njk"
  };
};
