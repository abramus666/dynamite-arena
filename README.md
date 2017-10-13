# Dynamite Arena
https://abramus666.github.io/dynamite-arena/

This is my attempt to bring back local multiplayer gameplay of the classic Dynablaster/Bomberman game.

It all started a long time ago. In high school, me and my friends played that game against each other a lot. (Yea I'm old. But not THAT old - we had rather ancient computers at school, for that time, so we couldn't play anything more recent.) Few years later, I had to do a Pascal project for my programming classes at university, and I decided to make a clone of that game. It was fairly simple and only allowed local multiplayer between two players on one computer. There was no single player mode.

Fast forward to a fairly recent past, I decided to port my old game to Javascript as I was learning that language. After I was done, I thought "why not make it better?" So I improved graphics, configurability, and added AI.
- I remade textures in higher resolution, added shadows to make the game look more 3D-like, and replaced all sprites with vector models. (I'm not certain the latter change was a good idea. Each vector model consists of many polygons, and their rendering on HTML5 canvas is rather slow. Sprites would be faster. On the other hand, model animation is very smooth if your machine is good enough.)
- I added a menu to configure map size and number of players.
- I added an AI system so that you can play against computer-controlled opponents. This was my first attempt at non-trivial game AI, and I'm happy about results. It is nowhere near as smart as a decent player would be, but it compensates for it with millisecond-tight precision :wink: All in all, AI makes a reasonable challenge while not appearing that much "artificial", so it's not bad. There are no difficulty settings.

Menu controls:
- Use Esc to toggle menu on/off.
- Use up/down arrows to move between options.
- Use left/right arrows to change current option.
- Select "Start game" and press Enter to apply changes.

Player 1 controls:
- Use arrow keys to move.
- Use Enter to set bomb.

Player 2 controls:
- Use W,S,A,D keys to move.
- Use Q key to set bomb.
