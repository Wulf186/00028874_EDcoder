# Project Overview
- **Component**: `NVItemEncoderDecoder` (`28874encoder_decoder.jsx`) is a self‑contained React function component that decodes and encodes the 00028874 binary format (descriptor table for band combinations). It exposes a tabbed UI for decoding files, editing combo strings, and exporting binary/TXT results, tracking grouping/descriptor statistics, and preserving original groups. It only depends on React hooks (`useState`, `useCallback`) and the browser File + Clipboard APIs.
- **Styling**: Tailwind‑style utility classes appear throughout (`bg-gray-900`, `text-green-300`, etc.). If you do not have Tailwind configured, you can drop in a small CSS reset (e.g., hugging the class names used or switch to your design system) since no Tailwind directives are required at runtime.

# Getting Started (Browser)
1. **Create a React environment** (Vite is the fast path):
   ```bash
   npm create vite@latest encoder-decoder -- --template react
   cd encoder-decoder
   npm install
   ```
2. **Add the component**:
   - Copy `28874encoder_decoder.jsx` into `src/`.
   - In `src/App.jsx`, import and render it:
     ```jsx
     import NVItemEncoderDecoder from './28874encoder_decoder';
     
     export default function App() {
       return <NVItemEncoderDecoder />;
     }
     ```
3. **Optional styling**: Install Tailwind or replace the class names with your own CSS. Minimal styling still works since the component mostly relies on layout classes.

# Running / Building
- `npm run dev` – starts Vite's dev server and opens the component in the browser.
- `npm run build` – emits a production bundle under `dist/`.
- `npm run preview` – serves the production build for one last sanity check.

# Notes
- Ensure your browser can read local files (drag‑drop or `input[type="file"]`). The component uses `FileReader`, `Blob`, and the Clipboard API for exports, so run it within HTTPS or `localhost`.
