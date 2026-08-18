HEADER_ALIASES = {
  "word": ["word", "单词", "词汇", "英文", "英语单词", "词", "term", "expression", "表达式"],
  "meaning": ["meaning", "释义", "中文释义", "中文意思", "意思", "词义", "翻译", "解释", "definition", "translation"],
  "type": ["type", "wordtype", "word_type", "词性", "类别", "词类"],
  "category": ["category", "分类", "学习分类", "难度分类", "标签"],
  "source": ["source", "来源"],
}

def normalize_header(value):
    return "".join(str(value or "").strip().lower().replace("_", "").replace("-", "").split())

def first_field(item, aliases):
    normalized_aliases = {normalize_header(alias) for alias in aliases}
    for key, value in item.items():
        if normalize_header(key) in normalized_aliases and str(value or "").strip():
            return str(value).strip()
    return ""
