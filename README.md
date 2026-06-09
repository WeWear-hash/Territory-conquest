# Territory Conquest

A static browser strategy game inspired by real-time territory conquest games. It runs directly from `index.html`, needs no install step, and is suitable for GitHub Pages hosting.

## Play

- Open `index.html` in a browser, or host the folder on GitHub Pages.
- Choose **Bots** for local play.
- Choose **Host Online** or **Join Online** for manual WebRTC join-code play.
- Select a land tile, start the match, then click your own land and a neighboring target to attack.
- Spend army power on Economy, Logistics, and Fortify upgrades.

## Online Join Codes

1. Host clicks **Host Online**, then **Create**.
2. Guest clicks **Join Online**, pastes the host code, then clicks **Accept**.
3. Guest sends the generated answer code back to the host.
4. Host pastes the answer code and clicks **Connect**.

GitHub Pages only serves static files, so this project uses peer-to-peer WebRTC instead of a server lobby.

## Deploy To GitHub Pages

Commit these files, push to GitHub, and enable Pages for the repository branch. The game uses only relative paths and browser-native JavaScript modules.
