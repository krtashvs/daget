"use client";

import EmojiPicker, { Categories, EmojiStyle, SuggestionMode, Theme } from "emoji-picker-react";

const CATEGORIES = [
  { category: Categories.SUGGESTED, name: "Sering dipakai" },
  { category: Categories.SMILEYS_PEOPLE, name: "Wajah & Orang" },
  { category: Categories.ANIMALS_NATURE, name: "Hewan & Alam" },
  { category: Categories.FOOD_DRINK, name: "Makanan & Minuman" },
  { category: Categories.TRAVEL_PLACES, name: "Tempat" },
  { category: Categories.ACTIVITIES, name: "Aktivitas" },
  { category: Categories.OBJECTS, name: "Benda" },
  { category: Categories.SYMBOLS, name: "Simbol" },
  { category: Categories.FLAGS, name: "Bendera" },
];

export default function EmojiPanel({ onPick }: { onPick: (emoji: string) => void }) {
  return (
    <EmojiPicker
      theme={Theme.DARK}
      emojiStyle={EmojiStyle.NATIVE}
      suggestedEmojisMode={SuggestionMode.RECENT}
      categories={CATEGORIES}
      searchPlaceholder="Cari emoji"
      previewConfig={{ showPreview: false }}
      skinTonesDisabled
      lazyLoadEmojis
      width="100%"
      height={360}
      onEmojiClick={(data) => onPick(data.emoji)}
    />
  );
}
