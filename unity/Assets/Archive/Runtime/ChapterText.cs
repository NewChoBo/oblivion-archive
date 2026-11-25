using System;
using Newtonsoft.Json.Linq;
using UnityEngine;

namespace Archive
{
    internal sealed class ChapterText
    {
        private readonly JObject english;
        private readonly JObject korean;
        private const string Preference = "archive.unity.language";
        public bool IsKorean { get; private set; }

        public ChapterText()
        {
            english = Read("en");
            korean = Read("ko");
            string language = PlayerPrefs.GetString(Preference, "en");
            if (Uri.TryCreate(Application.absoluteURL, UriKind.Absolute, out Uri page))
            {
                foreach (string part in page.Query.TrimStart('?').Split('&'))
                {
                    if (part == "lang=ko") language = "ko";
                    else if (part == "lang=en") language = "en";
                }
            }
            IsKorean = language == "ko";
        }

        private static JObject Read(string locale)
        {
            var file = Resources.Load<TextAsset>("ArchiveText/" + locale);
            if (file == null) throw new InvalidOperationException("Missing chapter catalogue: " + locale);
            return JObject.Parse(file.text);
        }

        public string this[string key] =>
            (IsKorean ? (string)korean[key] : null) ?? (string)english[key] ?? key;

        public string OtherLanguage => (string)(IsKorean ? english : korean)["menu.language"];

        public void Toggle()
        {
            IsKorean = !IsKorean;
            PlayerPrefs.SetString(Preference, IsKorean ? "ko" : "en");
            PlayerPrefs.Save();
        }
    }
}
