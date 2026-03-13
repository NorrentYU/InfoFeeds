import { fetchTelegramSources } from "./index.js";

const sources = ["https://t.me/cookiesreads", "https://t.me/web3list"];

const result = await fetchTelegramSources(sources, {
  windowHours: 24,
  retryCount: 1,
  maxMessagesPerSource: 30
});

console.log(JSON.stringify(result, null, 2));
