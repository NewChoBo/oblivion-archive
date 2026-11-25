mergeInto(LibraryManager.library, {
  ArchiveExpeditionRead: function () {
    try {
      var value = window.localStorage.getItem("oblivion-archive.expedition.v1");
      if (!value) return 0;
      var size = lengthBytesUTF8(value) + 1;
      var ptr = _malloc(size);
      stringToUTF8(value, ptr, size);
      return ptr;
    } catch (_error) { return 0; }
  },
  ArchiveExpeditionWrite: function (pointer) {
    try {
      window.localStorage.setItem("oblivion-archive.expedition.v1", UTF8ToString(pointer));
    } catch (_error) { /* The native PlayerPrefs copy remains available. */ }
  },
});
