mergeInto(LibraryManager.library, {
  ArchiveStoryRead: function (ptr) {
    var value = '';
    try { value = window.localStorage.getItem(UTF8ToString(ptr)) || ''; } catch (e) {}
    var size = lengthBytesUTF8(value) + 1;
    var result = _malloc(size);
    stringToUTF8(value, result, size);
    return result;
  },
  ArchiveStoryWrite: function (ptr, content) {
    try {
      var key = UTF8ToString(ptr);
      if (content) window.localStorage.setItem(key, UTF8ToString(content));
      else window.localStorage.removeItem(key);
    } catch (e) {}
  }
});
