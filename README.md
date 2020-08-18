# [Dynamite Arena](https://abramus666.github.io/dynamite-arena/)

This is my attempt to bring back local multiplayer gameplay of the classic Dynablaster/Bomberman game.

In high school, me and my friends played that game against each other a lot. Few years later, I had to do a Pascal project for my programming classes at university, and I decided to make a clone of that game. It was fairly simple and only allowed local multiplayer between two players on one computer. There was no single player mode.

Fast forward to a fairly recent past, I ported my old game to Javascript as I was learning that language. After it was done, I decided to improve graphics, configurability, and add AI.
- I remade textures in higher resolution, added shadows to make the game look more 3D-like, and replaced all sprites with vector models. Unfortunately polygon rendering on HTML5 canvas is rather slow, but the advantage of vector models over sprites is that animation frames can be interpolated. This makes animation very smooth on a good enough machine.
- I added a menu to configure map size and number of players.
- I added an AI system so that you can play against computer-controlled opponents. This was my first attempt at non-trivial game AI, and I'm happy about results. It is nowhere near as smart as a decent player would be, but it compensates for it with a millisecond-tight precision :wink: AI makes a reasonable challenge while not appearing that much "artificial". There are no difficulty settings.

Menu controls:
- Menu can be controlled using mouse or keyboard (arrow keys and Enter).
- Click mouse or press Esc to toggle menu on/off.
- Click on "Start game", or select it using arrow keys and press Enter, to apply configuration changes and start a new game.

Player 1 controls:
- Use arrow keys to move.
- Press Enter to set bomb.

Player 2 controls:
- Use W,S,A,D keys to move.
- Press Q key to set bomb.
