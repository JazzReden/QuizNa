export type QuoteCategory = "love" | "gospel" | "wisdom" | "future" | "education";
export type LoadingRole = "teacher" | "student";
export interface LoadingQuote { id: string; category: QuoteCategory; text: string; source: string; }
export const ROLE_QUOTE_CATEGORIES: Record<LoadingRole, readonly QuoteCategory[]> = {
  teacher: ["love", "wisdom", "education", "gospel"],
  student: ["love", "wisdom", "future", "education", "gospel"],
};
export const POST_LOGIN_MIN_MS = 6800;
export const loadingQuotes: readonly LoadingQuote[] = [
  {
    "id": "love-1",
    "category": "love",
    "text": "Whoever does not love does not know God, because God is love.",
    "source": "1 John 4:8"
  },
  {
    "id": "love-2",
    "category": "love",
    "text": "For God so loved the world that he gave his one and only Son, that whoever believes in him shall not perish but have eternal life.",
    "source": "John 3:16"
  },
  {
    "id": "love-3",
    "category": "love",
    "text": "A new command I give you: Love one another. As I have loved you, so you must love one another.",
    "source": "John 13:34"
  },
  {
    "id": "love-4",
    "category": "love",
    "text": "Above all, love each other deeply, because love covers over a multitude of sins.",
    "source": "1 Peter 4:8"
  },
  {
    "id": "love-5",
    "category": "love",
    "text": "Love must be sincere. Hate what is evil; cling to what is good.",
    "source": "Romans 12:9"
  },
  {
    "id": "gospel-1",
    "category": "gospel",
    "text": "If you declare with your mouth, 'Jesus is Lord,' and believe in your heart that God raised him from the dead, you will be saved.",
    "source": "Romans 10:9"
  },
  {
    "id": "gospel-2",
    "category": "gospel",
    "text": "For the wages of sin is death, but the gift of God is eternal life in Christ Jesus our Lord.",
    "source": "Romans 6:23"
  },
  {
    "id": "gospel-3",
    "category": "gospel",
    "text": "For it is by grace you have been saved, through faith, and this is not from yourselves, it is the gift of God, not by works, so that no one can boast.",
    "source": "Ephesians 2:8-9"
  },
  {
    "id": "gospel-4",
    "category": "gospel",
    "text": "I am the way and the truth and the life. No one comes to the Father except through me.",
    "source": "John 14:6"
  },
  {
    "id": "gospel-5",
    "category": "gospel",
    "text": "Here I am! I stand at the door and knock. If anyone hears my voice and opens the door, I will come in and eat with them, and they with me.",
    "source": "Revelation 3:20"
  },
  {
    "id": "wisdom-1",
    "category": "wisdom",
    "text": "The fear of the LORD is the beginning of wisdom, and knowledge of the Holy One is understanding.",
    "source": "Proverbs 9:10"
  },
  {
    "id": "wisdom-2",
    "category": "wisdom",
    "text": "If any of you lacks wisdom, you should ask God, who gives generously to all without finding fault, and it will be given to you.",
    "source": "James 1:5"
  },
  {
    "id": "wisdom-3",
    "category": "wisdom",
    "text": "Trust in the LORD with all your heart and lean not on your own understanding; in all your ways submit to him, and he will make your paths straight.",
    "source": "Proverbs 3:5-6"
  },
  {
    "id": "wisdom-4",
    "category": "wisdom",
    "text": "The beginning of wisdom is this: Get wisdom. Though it cost all you have, get understanding.",
    "source": "Proverbs 4:7"
  },
  {
    "id": "wisdom-5",
    "category": "wisdom",
    "text": "For the LORD gives wisdom; from his mouth come knowledge and understanding.",
    "source": "Proverbs 2:6"
  },
  {
    "id": "future-1",
    "category": "future",
    "text": "For I know the plans I have for you,\" declares the LORD, \"plans to prosper you and not to harm you, plans to give you hope and a future.",
    "source": "Jeremiah 29:11"
  },
  {
    "id": "future-2",
    "category": "future",
    "text": "Commit to the LORD whatever you do, and he will establish your plans.",
    "source": "Proverbs 16:3"
  },
  {
    "id": "future-3",
    "category": "future",
    "text": "I can do all this through him who gives me strength.",
    "source": "Philippians 4:13"
  },
  {
    "id": "future-4",
    "category": "future",
    "text": "Take delight in the LORD, and he will give you the desires of your heart.",
    "source": "Psalm 37:4"
  },
  {
    "id": "future-5",
    "category": "future",
    "text": "Many are the plans in a person's heart, but it is the LORD's purpose that prevails.",
    "source": "Proverbs 19:21"
  },
  {
    "id": "education-1",
    "category": "education",
    "text": "Education is the most powerful weapon which you can use to change the world.",
    "source": "Nelson Mandela"
  },
  {
    "id": "education-2",
    "category": "education",
    "text": "The function of education is to teach one to think intensively and to think critically. Intelligence plus character: that is the goal of true education.",
    "source": "Martin Luther King Jr."
  },
  {
    "id": "education-3",
    "category": "education",
    "text": "An investment in knowledge pays the best interest.",
    "source": "Benjamin Franklin"
  },
  {
    "id": "education-4",
    "category": "education",
    "text": "The roots of education are bitter, but the fruit is sweet.",
    "source": "Aristotle"
  },
  {
    "id": "education-5",
    "category": "education",
    "text": "The mind is not a vessel to be filled, but a fire to be kindled.",
    "source": "Plutarch"
  }
];

export function chooseLoadingQuote(role: LoadingRole): LoadingQuote {
  let previous: string | null = null;
  try { previous = localStorage.getItem("quizna_last_loading_quote"); } catch { /* Storage may be disabled. */ }
  const choices = loadingQuotes.filter(q => ROLE_QUOTE_CATEGORIES[role].includes(q.category) && q.id !== previous);
  const quote = choices[Math.floor(Math.random() * choices.length)];
  try { localStorage.setItem("quizna_last_loading_quote", quote.id); } catch { /* Keep login available. */ }
  return quote;
}
