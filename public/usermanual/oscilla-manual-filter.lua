-- oscilla-manual-filter.lua
-- Pandoc Lua filter for Oscilla user manual
--
-- 1. Promotes headings with {.chapter} class back to level 1 (\chapter)
--    after --shift-heading-level-by=1 has demoted them to level 2
-- 2. Strips emoji characters
-- 3. Caps section depth: h4+ become bold paragraphs

local function strip_emoji(text)
  local cleaned = text
    :gsub("[\xE2\x8F\xB0-\xE2\x8F\xBF]", "")
    :gsub("[\xE2\x9A\xA0-\xE2\x9A\xBF]", "")
    :gsub("[\xE2\x9C\x80-\xE2\x9C\xBF]", "")
    :gsub("[\xE2\x9D\x80-\xE2\x9D\xBF]", "")
    :gsub("[\xE2\xAC\x80-\xE2\xAC\xBF]", "")
    :gsub("[\xE2\xAD\x80-\xE2\xAD\xBF]", "")
    :gsub("[\xF0\x9F\x80\x80-\xF0\x9F\xBF\xBF]", "")
    :gsub("[\xE2\x98\x80-\xE2\x98\xBF]", "")
    :gsub("[\xE2\x99\x80-\xE2\x99\xBF]", "")
    :gsub("[\xE2\x96\xA0-\xE2\x97\xBF]", "")
    :gsub("[\xC2\xA0]", " ")
    :gsub("  +", " ")
    :gsub("^ ", ""):gsub(" $", "")
  return cleaned
end

function Str(el)
  local cleaned = strip_emoji(el.text)
  if cleaned == "" then
    return {}
  end
  return pandoc.Str(cleaned)
end

function Header(el)
  -- {.chapter} headings: promote back to chapter level
  -- After --shift-heading-level-by=1, a # heading arrives as level 2.
  -- We set it to level 1 which maps to \chapter in report/book class.
  if el.classes:includes("chapter") then
    el.level = 1
    el.classes = el.classes:filter(function(c) return c ~= "chapter" end)
    return el
  end

  -- Cap depth: h4+ become bold paragraphs
  if el.level >= 4 then
    local bold = pandoc.Strong(el.content)
    return pandoc.Para({bold})
  end

  return el
end
