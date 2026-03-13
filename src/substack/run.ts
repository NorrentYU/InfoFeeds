import { fetchSubstackSources } from "./index.js";

const sources = [
  "https://www.systematiclongshort.com/",
  "https://www.astralcodexten.com/",
];

const result = await fetchSubstackSources(sources, {
  windowHours: 24,
  retryCount: 1,
  maxItemsPerSource: 80,
});

console.log(JSON.stringify(result, null, 2));
