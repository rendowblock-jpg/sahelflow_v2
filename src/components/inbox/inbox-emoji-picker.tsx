"use client";

import { useMemo, useRef, useState } from "react";
import { Smile } from "lucide-react";

import { Button } from "@/components/ui/button";
import {
  Popover,
  PopoverContent,
  PopoverTrigger,
} from "@/components/ui/popover";
import { Input } from "@/components/ui/input";
import { useInboxWorkspace } from "@/hooks/use-inbox-workspace";
import { cn } from "@/lib/utils";

/**
 * Dependency-free WhatsApp-class emoji picker (ledger INB-02).
 * Categories → search → recents (MRU persisted per device). Chosen over a
 * heavyweight emoji library to keep the local-first Tauri bundle lean; the
 * curated set covers the expressions COD sellers actually exchange daily.
 */

const RECENTS_KEY = "sf.inbox.emoji.recents";
const RECENTS_MAX = 24;

type EmojiEntry = { e: string; n: string };

type EmojiCategoryKey =
  | "emojiCatSmileys"
  | "emojiCatAnimals"
  | "emojiCatFood"
  | "emojiCatActivity"
  | "emojiCatTravel"
  | "emojiCatObjects"
  | "emojiCatSymbols"
  | "emojiCatFlags";

type EmojiCategory = { key: EmojiCategoryKey; entries: EmojiEntry[] };

const CATEGORIES: EmojiCategory[] = ([
  {
    key: "emojiCatSmileys",
    entries: [
      { e: "😀", n: "grinning" }, { e: "😃", n: "smiley" }, { e: "😄", n: "smile" },
      { e: "😁", n: "grin" }, { e: "😆", n: "laughing" }, { e: "😅", n: "sweat smile" },
      { e: "🤣", n: "rofl" }, { e: "😂", n: "joy tears" }, { e: "🙂", n: "slight smile" },
      { e: "😉", n: "wink" }, { e: "😊", n: "blush" }, { e: "😇", n: "innocent halo" },
      { e: "🥰", n: "love hearts" }, { e: "😍", n: "heart eyes" }, { e: "🤩", n: "star struck" },
      { e: "😘", n: "kiss" }, { e: "😗", n: "kissing" }, { e: "😎", n: "cool sunglasses" },
      { e: "🤓", n: "nerd" }, { e: "🧐", n: "monocle" }, { e: "🤔", n: "thinking" },
      { e: "🤨", n: "raised eyebrow" }, { e: "😐", n: "neutral" }, { e: "😑", n: "expressionless" },
      { e: "🙄", n: "eye roll" }, { e: "😏", n: "smirk" }, { e: "😴", n: "sleeping" },
      { e: "🤤", n: "drooling" }, { e: "😪", n: "sleepy" }, { e: "😵", n: "dizzy" },
      { e: "🤯", n: "mind blown" }, { e: "🥳", n: "party" }, { e: "😎", n: "cool" },
      { e: "🤗", n: "hug" }, { e: "🤭", n: "giggle" }, { e: "🤫", n: "shush" },
      { e: "🥱", n: "yawn" }, { e: "😷", n: "mask" }, { e: "🤒", n: "sick thermometer" },
      { e: "🤕", n: "bandage hurt" }, { e: "🥴", n: "tipsy" }, { e: "😤", n: "triumph" },
      { e: "😡", n: "rage angry" }, { e: "🤬", n: "cursing" }, { e: "😭", n: "sob cry" },
      { e: "😢", n: "crying" }, { e: "😦", n: "frowning" }, { e: "😰", n: "anxious" },
      { e: "😱", n: "scream fear" }, { e: "🤝", n: "handshake deal" }, { e: "🙏", n: "please thanks pray" },
      { e: "💪", n: "strong muscle" }, { e: "👌", n: "ok hand" }, { e: "✌️", n: "victory peace" },
      { e: "👍", n: "thumbs up like" }, { e: "👎", n: "thumbs down dislike" }, { e: "👏", n: "clap applause" },
      { e: "🤞", n: "fingers crossed" }, { e: "🤙", n: "call me" }, { e: "👋", n: "wave hello bye" },
      { e: "🫡", n: "salute" }, { e: "🫶", n: "heart hands love" }, { e: "❤️", n: "red heart love" },
      { e: "🧡", n: "orange heart" }, { e: "💛", n: "yellow heart" }, { e: "💚", n: "green heart" },
      { e: "💙", n: "blue heart" }, { e: "💜", n: "purple heart" }, { e: "🖤", n: "black heart" },
      { e: "💔", n: "broken heart" }, { e: "💯", n: "hundred perfect" }, { e: "🔥", n: "fire hot" },
    ],
  },
  {
    key: "emojiCatAnimals",
    entries: [
      { e: "🐱", n: "cat" }, { e: "🐶", n: "dog puppy" }, { e: "🐭", n: "mouse" },
      { e: "🐹", n: "hamster" }, { e: "🐰", n: "rabbit bunny" }, { e: "🦊", n: "fox" },
      { e: "🐻", n: "bear" }, { e: "🐼", n: "panda" }, { e: "🐨", n: "koala" },
      { e: "🐯", n: "tiger" }, { e: "🦁", n: "lion" }, { e: "🐮", n: "cow" },
      { e: "🐷", n: "pig" }, { e: "🐸", n: "frog" }, { e: "🐵", n: "monkey" },
      { e: "🐔", n: "chicken" }, { e: "🐧", n: "penguin" }, { e: "🐦", n: "bird" },
      { e: "🦅", n: "eagle" }, { e: "🦉", n: "owl" }, { e: "🐴", n: "horse" },
      { e: "🦂", n: "scorpion" }, { e: "🐍", n: "snake" }, { e: "🦎", n: "lizard" },
      { e: "🐫", n: "camel" }, { e: "🐪", n: "desert camel" }, { e: "🐐", n: "goat" },
      { e: "🌵", n: "cactus desert" }, { e: "🌴", n: "palm tree" }, { e: "🌙", n: "moon night" },
      { e: "⭐", n: "star" }, { e: "☀️", n: "sun hot" }, { e: "🌧️", n: "rain" },
      { e: "🌻", n: "sunflower" }, { e: "🌹", n: "rose" }, { e: "🍀", n: "clover luck" },
    ],
  },
  {
    key: "emojiCatFood",
    entries: [
      { e: "☕", n: "coffee" }, { e: "🍵", n: "tea" }, { e: "🥤", n: "soda drink" },
      { e: "💧", n: "water drop" }, { e: "🧃", n: "juice" }, { e: "🥛", n: "milk" },
      { e: "🍞", n: "bread" }, { e: "🥖", n: "baguette" }, { e: "🥐", n: "croissant" },
      { e: "🫓", n: "flatbread" }, { e: "🍚", n: "rice" }, { e: "🍲", n: "stew soup" },
      { e: "🥗", n: "salad" }, { e: "🍗", n: "chicken food" }, { e: "🍔", n: "burger" },
      { e: "🍕", n: "pizza" }, { e: "🌮", n: "taco" }, { e: "🍟", n: "fries" },
      { e: "🍩", n: "donut" }, { e: "🍪", n: "cookie" }, { e: "🎂", n: "cake birthday" },
      { e: "🍫", n: "chocolate" }, { e: "🍬", n: "candy" }, { e: "🍉", n: "watermelon" },
      { e: "🍇", n: "grapes" }, { e: "🍊", n: "orange fruit" }, { e: "🍋", n: "lemon" },
      { e: "🍌", n: "banana" }, { e: "🍎", n: "apple" }, { e: "🍏", n: "green apple" },
      { e: "🍐", n: "pear" }, { e: "🍑", n: "peach" }, { e: "🥭", n: "mango" },
      { e: "🫒", n: "olive" }, { e: "🍅", n: "tomato" }, { e: "🥔", n: "potato" },
    ],
  },
  {
    key: "emojiCatActivity",
    entries: [
      { e: "⚽", n: "football soccer" }, { e: "🏀", n: "basketball" }, { e: "🏏", n: "cricket" },
      { e: "🎯", n: "target dart" }, { e: "🎮", n: "gaming controller" }, { e: "🎲", n: "dice" },
      { e: "🏆", n: "trophy win" }, { e: "🥇", n: "gold medal first" }, { e: "🎉", n: "party popper celebrate" },
      { e: "🎊", n: "confetti" }, { e: "🎁", n: "gift" }, { e: "🎵", n: "music note" },
      { e: "🎤", n: "microphone sing" }, { e: "📸", n: "camera photo" }, { e: "🎬", n: "clapper film" },
      { e: "🛒", n: "cart shopping order" }, { e: "📦", n: "package parcel delivery" },
      { e: "🚚", n: "truck delivery shipping" }, { e: "💰", n: "money bag cash" },
      { e: "💵", n: "dollar money" }, { e: "💳", n: "card payment" }, { e: "🧾", n: "receipt invoice" },
      { e: "📞", n: "phone call" }, { e: "💬", n: "chat message" }, { e: "⏰", n: "alarm clock time" },
      { e: "⌛", n: "hourglass wait" }, { e: "📌", n: "pin" }, { e: "🗂️", n: "files organize" },
    ],
  },
  {
    key: "emojiCatTravel",
    entries: [
      { e: "🚗", n: "car" }, { e: "🚕", n: "taxi" }, { e: "🚌", n: "bus" },
      { e: "🏍️", n: "motorcycle" }, { e: "🛵", n: "scooter" }, { e: "🚲", n: "bicycle" },
      { e: "✈️", n: "plane flight" }, { e: "🚢", n: "ship" }, { e: "🗺️", n: "map" },
      { e: "🕌", n: "mosque" }, { e: "🏛️", n: "building" }, { e: "🏙️", n: "city" },
      { e: "🏖️", n: "beach" }, { e: "🏔️", n: "mountain" }, { e: "🏠", n: "house home" },
      { e: "🏢", n: "office" }, { e: "🏪", n: "shop store" }, { e: "🏥", n: "hospital" },
      { e: "📍", n: "location pin address" }, { e: "🧭", n: "compass" },
    ],
  },
  {
    key: "emojiCatObjects",
    entries: [
      { e: "📱", n: "phone mobile" }, { e: "💻", n: "laptop computer" }, { e: "🖥️", n: "desktop" },
      { e: "🖨️", n: "printer" }, { e: "🔋", n: "battery" }, { e: "🔌", n: "plug" },
      { e: "💡", n: "idea light" }, { e: "🔦", n: "flashlight" }, { e: "🧴", n: "lotion bottle" },
      { e: "🧹", n: "broom clean" }, { e: "🔧", n: "wrench fix" }, { e: "🔨", n: "hammer" },
      { e: "🛠️", n: "tools" }, { e: "🧵", n: "thread" }, { e: "👗", n: "dress fashion" },
      { e: "👕", n: "shirt tshirt" }, { e: "👖", n: "jeans pants" }, { e: "👟", n: "shoes sneakers" },
      { e: "👜", n: "bag handbag" }, { e: "🎒", n: "backpack school" }, { e: "👓", n: "glasses" },
      { e: "⌚", n: "watch" }, { e: "🔑", n: "key" }, { e: "🔒", n: "lock secure" },
      { e: "📎", n: "clip attach" }, { e: "📝", n: "memo note write" }, { e: "✏️", n: "pencil" },
      { e: "📚", n: "books" }, { e: "📰", n: "news" }, { e: "🗑️", n: "trash delete" },
    ],
  },
  {
    key: "emojiCatSymbols",
    entries: [
      { e: "✔️", n: "check yes done" }, { e: "✅", n: "check mark done complete" },
      { e: "❌", n: "cross no wrong" }, { e: "❓", n: "question" }, { e: "❗", n: "exclamation important" },
      { e: "⚠️", n: "warning" }, { e: "🚫", n: "forbidden no" }, { e: "♻️", n: "recycle" },
      { e: "🔧", n: "wrench" }, { e: "➕", n: "plus add" }, { e: "➖", n: "minus remove" },
      { e: "✖️", n: "multiply close" }, { e: "🔃", n: "refresh reload" }, { e: "🔄", n: "update sync" },
      { e: "🔴", n: "red circle" }, { e: "🟠", n: "orange circle" }, { e: "🟡", n: "yellow circle" },
      { e: "🟢", n: "green circle" }, { e: "🔵", n: "blue circle" }, { e: "🟣", n: "purple circle" },
      { e: "⬛", n: "black square" }, { e: "⬜", n: "white square" }, { e: "🔸", n: "orange diamond" },
      { e: "🔹", n: "blue diamond" }, { e: "💥", n: "boom collision" }, { e: "💤", n: "zzz sleep" },
      { e: "↩️", n: "reply back" }, { e: "↪️", n: "forward" }, { e: "🔀", n: "shuffle" },
      { e: "🔔", n: "bell notification" }, { e: "🔕", n: "bell mute silent" },
      { e: "🆗", n: "ok button" }, { e: "🆕", n: "new" }, { e: "🔝", n: "top" },
    ],
  },
  {
    key: "emojiCatFlags",
    entries: [
      { e: "🇩🇿", n: "algeria dz flag" }, { e: "🇫🇷", n: "france flag" }, { e: "🇸🇦", n: "saudi flag" },
      { e: "🇦🇪", n: "uae flag" }, { e: "🇲🇦", n: "morocco flag" }, { e: "🇹🇳", n: "tunisia flag" },
      { e: "🇪🇬", n: "egypt flag" }, { e: "🇹🇷", n: "turkey flag" }, { e: "🌍", n: "earth africa" },
      { e: "🌎", n: "americas" }, { e: "🌏", n: "asia earth" }, { e: "🏁", n: "checkered finish" },
    ],
  },
] satisfies EmojiCategory[]).map((category) => ({
  ...category,
  entries: category.entries.filter((entry) => entry.n !== ""),
}));

function readRecents(): string[] {
  try {
    const raw = window.localStorage.getItem(RECENTS_KEY);
    if (!raw) return [];
    const parsed: unknown = JSON.parse(raw);
    return Array.isArray(parsed)
      ? parsed.filter((item): item is string => typeof item === "string").slice(0, RECENTS_MAX)
      : [];
  } catch {
    return [];
  }
}

export function EmojiPicker({
  disabled,
  onSelect,
}: {
  disabled?: boolean;
  onSelect: (emoji: string) => void;
}) {
  const workspace = useInboxWorkspace();
  const { copy } = workspace;
  const [open, setOpen] = useState(false);
  const [activeCategory, setActiveCategory] = useState(0);
  const [query, setQuery] = useState("");
  const [recents, setRecents] = useState<string[]>([]);
  const searchRef = useRef<HTMLInputElement | null>(null);

  const normalizedQuery = query.trim().toLowerCase();
  const visible = useMemo(() => {
    if (!normalizedQuery) return null;
    const hits: EmojiEntry[] = [];
    for (const category of CATEGORIES) {
      for (const entry of category.entries) {
        if (entry.n.includes(normalizedQuery)) hits.push(entry);
        if (hits.length >= 48) return hits;
      }
    }
    return hits;
  }, [normalizedQuery]);

  const categoryEntries =
    visible ?? CATEGORIES[activeCategory]?.entries ?? [];

  const pushRecent = (emoji: string) => {
    setRecents((current) => {
      const next = [emoji, ...current.filter((item) => item !== emoji)].slice(
        0,
        RECENTS_MAX,
      );
      try {
        window.localStorage.setItem(RECENTS_KEY, JSON.stringify(next));
      } catch {
        // Storage may be unavailable (private mode) — recents stay session-only.
      }
      return next;
    });
  };

  const pick = (emoji: string) => {
    onSelect(emoji);
    pushRecent(emoji);
  };

  return (
    <Popover
      open={open}
      onOpenChange={(next) => {
        setOpen(next);
        // Recents hydrate on open (event handler, not an effect — no
        // cascading render).
        if (next) setRecents(readRecents());
      }}
    >
      <PopoverTrigger asChild>
        <Button
          type="button"
          variant="ghost"
          size="icon-sm"
          disabled={disabled}
          aria-label={copy("emojiTitle")}
          data-inbox-emoji-picker="true"
        >
          <Smile className="size-4" aria-hidden="true" />
        </Button>
      </PopoverTrigger>
      <PopoverContent
        side="top"
        align="start"
        sideOffset={8}
        className="w-[min(21rem,92vw)] p-2"
      >
        <Input
          ref={searchRef}
          value={query}
          onChange={(event) => setQuery(event.target.value)}
          placeholder={copy("emojiSearch")}
          aria-label={copy("emojiSearch")}
          className="h-8 bg-muted/20 text-[13px]"
        />
        {!visible ? (
          <div className="mt-1.5 flex gap-0.5 overflow-x-auto pb-0.5" role="tablist" aria-label={copy("emojiTitle")}>
            {CATEGORIES.map((category, index) => (
              <button
                key={category.key}
                type="button"
                role="tab"
                aria-selected={index === activeCategory}
                onClick={() => setActiveCategory(index)}
                className={cn(
                  "inline-flex h-7 shrink-0 items-center rounded-md px-1.5 text-sm outline-none transition-colors hover:bg-muted focus-visible:ring-2 focus-visible:ring-ring",
                  index === activeCategory && "bg-muted",
                )}
              >
                {category.entries[0]?.e}
              </button>
            ))}
          </div>
        ) : null}
        <div
          className="mt-1.5 grid max-h-56 grid-cols-8 gap-0.5 overflow-y-auto"
          role="listbox"
          aria-label={copy("emojiTitle")}
        >
          {!visible && recents.length > 0 ? (
            <>
              <p className="col-span-8 px-1 pb-0.5 pt-1 text-2xs font-medium text-muted-foreground">
                {copy("emojiRecent")}
              </p>
              {recents.map((emoji) => (
                <button
                  key={`recent-${emoji}`}
                  type="button"
                  role="option"
                  aria-label={emoji}
                  onClick={() => pick(emoji)}
                  className="flex size-8 items-center justify-center rounded-md text-lg outline-none transition-colors hover:bg-muted focus-visible:ring-2 focus-visible:ring-ring"
                >
                  {emoji}
                </button>
              ))}
              <p className="col-span-8 px-1 pb-0.5 pt-1 text-2xs font-medium text-muted-foreground">
                {copy(CATEGORIES[activeCategory]?.key ?? "emojiCatSmileys")}
              </p>
            </>
          ) : null}
          {categoryEntries.map((entry) => (
            <button
              key={`${entry.e}-${entry.n}`}
              type="button"
              role="option"
              aria-label={entry.n}
              onClick={() => pick(entry.e)}
              className="flex size-8 items-center justify-center rounded-md text-lg outline-none transition-colors hover:bg-muted focus-visible:ring-2 focus-visible:ring-ring"
            >
              {entry.e}
            </button>
          ))}
          {categoryEntries.length === 0 ? (
            <p className="col-span-8 px-1 py-4 text-center text-xs text-muted-foreground">
              {copy("searchNoMatches")}
            </p>
          ) : null}
        </div>
      </PopoverContent>
    </Popover>
  );
}
