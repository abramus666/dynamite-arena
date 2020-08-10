
var DIRECTION_NONE  = 0;
var DIRECTION_UP    = 1;
var DIRECTION_DOWN  = 2;
var DIRECTION_LEFT  = 3;
var DIRECTION_RIGHT = 4;

// DIRECTION_NONE /UP   /DOWN /LEFT /RIGHT
var DX =    [0,    0,    0,   -1,   +1];
var DY =    [0,   -1,   +1,    0,    0];

var TILE_NONE  = 0; // Nothing
var TILE_ROCK  = 1; // Destructible
var TILE_METAL = 2; // Indestructible

var TILE_SIZE_PX = 64;

var TILE_SHADOW_TRANSPARENCY = 0.75;

var POWERUP_BOMB  = 1;
var POWERUP_RANGE = 2;

var POWERUP_BOMB_ANIM_LEN  = 4.0; // Animation contains 180 degrees of rotation.
var POWERUP_RANGE_ANIM_LEN = 1.0; // Animation contains 45  degrees of rotation.

var PLAYER_1 = 1;
var PLAYER_2 = 2;
var PLAYER_3 = 3;
var PLAYER_4 = 4;

var PLAYER_NONE  = 0;
var PLAYER_HUMAN = 1;
var PLAYER_BOT   = 2;

var PLAYER_SPEED = 4.0;

var PLAYER_DEAD_ANIM_LEN = 3.0;

var BOMB_TIME_TO_KILL  = 1.5;
var EXPL_TIME_TO_SPAWN = 0.05;
var EXPL_TIME_TO_KILL  = 0.4;

var KEY_ENTER = 13;
var KEY_ESC   = 27;
var KEY_LEFT  = 37;
var KEY_UP    = 38;
var KEY_RIGHT = 39;
var KEY_DOWN  = 40;
var KEY_A     = 65;
var KEY_D     = 68;
var KEY_Q     = 81;
var KEY_S     = 83;
var KEY_W     = 87;

var g_menu       = null;
var g_config     = null;
var g_map_redraw = false;
var g_map        = [];
var g_bombs      = [];
var g_powerups   = [];
var g_players    = [];
var g_explosions = [];
var g_keyboard   = {};
var g_timestamp  = 0;

//==============================================================================

// Return deep copy of an object. Only Array, Object, and immutable types
// (String, Number, Boolean) are supported. Prototype inheritance is not supported.
function cloneObject(obj) {
   var clone = obj;
   if(obj instanceof Array) {
      clone = [];
      for(var ix = 0; ix < obj.length; ix++) {
         clone[ix] = cloneObject(obj[ix]);
      }
   } else if(obj instanceof Object) {
      clone = {};
      for(var attr in obj) {
         clone[attr] = cloneObject(obj[attr]);
      }
   }
   return clone;
}

//==============================================================================

function initModel(model) {
   var bbox  = model['blocks']['bbox'][0];
   var verts = model['vertices'][''][0];
   // Preallocate a buffer for interpolated vertices to prevent allocations when drawing.
   model.buffer = new Array(verts.length * 2);
   // Calculate center and height of the model.
   var v1 = verts[bbox[0]]
   var v2 = verts[bbox[1]]
   var center = [(v1[0] + v2[0]) / 2.0, (v1[1] + v2[1]) / 2.0];
   var height = Math.abs(v1[1] - v2[1]);
   // Transform all vertices into a flat array.
   var anims = model['vertices'];
   for(var anim_name in anims) {
      var frames = anims[anim_name];
      for(frame_ix = 0; frame_ix < frames.length; frame_ix++) {
         var oldverts = frames[frame_ix];
         var newverts = new Array(verts.length * 2);
         for(var vert_ix = 0; vert_ix < verts.length; vert_ix++) {
            newverts[vert_ix*2]   = (oldverts[vert_ix][0] - center[0]) * (TILE_SIZE_PX / height);
            newverts[vert_ix*2+1] = (oldverts[vert_ix][1] - center[1]) * (TILE_SIZE_PX / height);
         }
         frames[frame_ix] = newverts;
      }
   }
}

function drawModel(ctx, model, pos_x, pos_y, anim_name, anim_pos) {
   if(anim_pos < 0.0) anim_pos = 0.0;
   if(anim_pos > 1.0) anim_pos = 1.0;
   var polys = model['polygons'];
   var anim  = model['vertices'][anim_name];
   var frame_num = anim_pos * (anim.length - 1.0);
   var frame_ix = Math.floor(frame_num);
   var anim_delta = frame_num - frame_ix;
   var verts = anim[frame_ix];
   if(anim_delta > 0.0) {
      verts = model.buffer; // Preallocated
      for(vert_ix = 0; vert_ix < verts.length; vert_ix++) {
         var v1 = anim[frame_ix][vert_ix];
         var v2 = anim[frame_ix+1][vert_ix];
         verts[vert_ix] = v1 + (v2 - v1) * anim_delta;
      }
   }
   ctx.translate(+pos_x, +pos_y);
   for(var poly_ix = 0; poly_ix < polys.length; poly_ix++) {
      var poly = polys[poly_ix];
      ctx.fillStyle = poly[0];
      ctx.beginPath();
      ctx.moveTo(verts[poly[1]*2], verts[poly[1]*2+1]);
      for(var ix = 2; ix < poly.length; ix++) {
         ctx.lineTo(verts[poly[ix]*2], verts[poly[ix]*2+1]);
      }
      ctx.fill();
   }
   // Reverse translation.
   ctx.translate(-pos_x, -pos_y);
}

function drawModelAtTile(ctx, model, x, y, anim_pos) {
   x = (x * TILE_SIZE_PX) + (TILE_SIZE_PX / 2);
   y = (y * TILE_SIZE_PX) + (TILE_SIZE_PX / 2);
   drawModel(ctx, model, x, y, '', anim_pos);
}

//==============================================================================

function decWithWrapAround(value, length) {
   return ((value != 0) ? (value - 1) : (length - 1));
}

function incWithWrapAround(value, length) {
   return ((value + 1) % length);
}

function newMenuOption_MapSize() {
   var items = [[7,7], [9,7], [9,9], [11,7], [11,9], [11,11], [13,9], [13,11], [15,9], [15,11]];
   var item_ix = 5;

   return {
      get:   function () {return items[item_ix];},
      prev:  function () {item_ix = decWithWrapAround(item_ix, items.length);},
      next:  function () {item_ix = incWithWrapAround(item_ix, items.length);},
      apply: function () {item_ix = incWithWrapAround(item_ix, items.length);},
      draw:  function (ctx, x, y) {
         ctx.fillText('Map size: ' + Number(items[item_ix][0]) + ' x ' + Number(items[item_ix][1]), x, y);
      }
   };
}

function newMenuOption_PowerUps() {
   var items = [0,1,2,3,4,5];
   var item_ix = 4;

   return {
      get:   function () {return items[item_ix];},
      prev:  function () {item_ix = decWithWrapAround(item_ix, items.length);},
      next:  function () {item_ix = incWithWrapAround(item_ix, items.length);},
      apply: function () {item_ix = incWithWrapAround(item_ix, items.length);},
      draw:  function (ctx, x, y) {
         ctx.fillText('PowerUps: ' + ((item_ix > 0) ? ('2 x ' + Number(items[item_ix])) : '0'), x, y);
      }
   };
}

function newMenuOption_Player(number) {
   var items, item_ix;
   if(number == PLAYER_1) {
      items = [[PLAYER_BOT, 'Computer'], [PLAYER_HUMAN, 'Human (Arrows + Enter)'], [PLAYER_NONE, 'None']];
      item_ix = 0;
   } else if(number == PLAYER_2) {
      items = [[PLAYER_BOT, 'Computer'], [PLAYER_HUMAN, 'Human (W,S,A,D + Q)'], [PLAYER_NONE, 'None']];
      item_ix = 0;
   } else {
      items = [[PLAYER_BOT, 'Computer'], [PLAYER_NONE, 'None']];
      item_ix = 0;
   }

   return {
      get:   function () {return items[item_ix][0];},
      prev:  function () {item_ix = decWithWrapAround(item_ix, items.length);},
      next:  function () {item_ix = incWithWrapAround(item_ix, items.length);},
      apply: function () {item_ix = incWithWrapAround(item_ix, items.length);},
      draw:  function (ctx, x, y) {
         ctx.fillText('Player ' + Number(number) + ': ' + items[item_ix][1], x, y);
      }
   };
}

function newMenuOption_Start() {
   return {
      prev:  function () {},
      next:  function () {},
      apply: function () {startGame();},
      draw:  function (ctx, x, y) {
         ctx.fillText('Start game', x, y);
      }
   };
}

function createMenu() {
   g_menu = {
      options: [
         newMenuOption_MapSize(),
         newMenuOption_PowerUps(),
         newMenuOption_Player(PLAYER_1),
         newMenuOption_Player(PLAYER_2),
         newMenuOption_Player(PLAYER_3),
         newMenuOption_Player(PLAYER_4),
         newMenuOption_Start()
      ],
      option_ix: -1,
      active: false
   };
}

function createConfiguration() {
   g_config = {
      map_width:    g_menu.options[0].get()[0],
      map_height:   g_menu.options[0].get()[1],
      num_powerups: g_menu.options[1].get(),
      player1:      g_menu.options[2].get(),
      player2:      g_menu.options[3].get(),
      player3:      g_menu.options[4].get(),
      player4:      g_menu.options[5].get()
   };
}

function updateMenuKey(keycode) {
   if(g_menu.option_ix >= 0) {
      if(keycode == KEY_ENTER) {
         g_menu.options[g_menu.option_ix].apply();
      } else if(keycode == KEY_LEFT) {
         g_menu.options[g_menu.option_ix].prev();
      } else if(keycode == KEY_RIGHT) {
         g_menu.options[g_menu.option_ix].next();
      } else if(keycode == KEY_UP) {
         g_menu.option_ix = decWithWrapAround(g_menu.option_ix, g_menu.options.length);
      } else if(keycode == KEY_DOWN) {
         g_menu.option_ix = incWithWrapAround(g_menu.option_ix, g_menu.options.length);
      }
   } else {
      if(keycode == KEY_UP) {
         g_menu.option_ix = g_menu.options.length-1;
      } else if(keycode == KEY_DOWN) {
         g_menu.option_ix = 0;
      }
   }
}

function updateMenuMouse(mouse_pos, click) {
   // The Y coordinates here need to match drawMenu().
   if(mouse_pos[1] >= 125 && mouse_pos[1] < (125 + 25 * g_menu.options.length)) {
      g_menu.option_ix = Math.floor((mouse_pos[1] - 125) / 25);
      if(click) {
         g_menu.options[g_menu.option_ix].apply();
      }
   } else {
      g_menu.option_ix = -1;
      if(click) {
         g_menu.active = false;
      }
   }
}

function drawMenu() {
   var ctx = document.getElementById('fg').getContext('2d');
   var x = 25;
   var y1 = 75;
   var y2 = 125;
   var dy = 25;
   ctx.globalAlpha = 0.5;
   ctx.fillStyle = 'rgb(0,0,0)';
   ctx.fillRect(0, 0, (g_config.map_width * TILE_SIZE_PX), (g_config.map_height * TILE_SIZE_PX));
   ctx.globalAlpha = 1.0;
   ctx.fillStyle = 'rgb(255,255,255)';
   ctx.font = '48px impact';
   ctx.fillText('Dynamite Arena', x, y1);
   ctx.font = '24px consolas';
   for(var ix = 0; ix < g_menu.options.length; ix++) {
      if(ix == g_menu.option_ix) {
         ctx.fillStyle = 'rgb(0,255,0)';
      }
      g_menu.options[ix].draw(ctx, x, y2 + dy * (ix + 1));
      if(ix == g_menu.option_ix) {
         ctx.fillStyle = 'rgb(255,255,255)';
      }
   }
}

//==============================================================================

function generateMap() {
   g_map = [];
   for(var x = 0; x < g_config.map_width; x++) {
      g_map.push([]);
      for(var y = 0; y < g_config.map_height; y++) {
         if((x % 2) && (y % 2)) {
            g_map[x].push(TILE_METAL);
         } else if(isPlayerArea(x, y)) {
            g_map[x].push(TILE_NONE);
         } else if(Math.random() < 0.5) {
            g_map[x].push(TILE_ROCK);
         } else {
            g_map[x].push(TILE_NONE);
         }
      }
   }
}

function isPlayerArea(x, y) {
   return (
      ((x == 0) && ((y <= 1) || (y >= g_config.map_height-2))) ||
      ((x == 1) && ((y == 0) || (y == g_config.map_height-1))) ||
      ((x == g_config.map_width-2) && ((y == 0) || (y == g_config.map_height-1))) ||
      ((x == g_config.map_width-1) && ((y <= 1) || (y >= g_config.map_height-2))) );
}

function getMapTile(x, y) {
   if((x < 0) || (y < 0) || (x >= g_config.map_width) || (y >= g_config.map_height)) {
      return TILE_METAL;
   } else {
      return g_map[x][y];
   }
}

function destroyMapTile(x, y) {
   g_map[x][y] = TILE_NONE;
   g_map_redraw = true;
}

function drawTileShadow(ctx, x, y) {
   var size = TILE_SIZE_PX;
   var size2 = size / 2.0;
   ctx.fillStyle = 'rgb(0,0,0)';
   ctx.beginPath();
   ctx.moveTo(x*size, y*size+size);
   ctx.lineTo(x*size+size, y*size+size);
   ctx.lineTo(x*size+size, y*size);
   ctx.lineTo(x*size+size+size2, y*size+size2);
   ctx.lineTo(x*size+size+size2, y*size+size+size2);
   ctx.lineTo(x*size+size2, y*size+size+size2);
   ctx.fill();
}

function drawMapShadows(ctx) {
   var new_canvas = document.createElement('canvas');
   var new_ctx = new_canvas.getContext('2d');
   new_canvas.width  = g_config.map_width  * TILE_SIZE_PX;
   new_canvas.height = g_config.map_height * TILE_SIZE_PX;
   for(var x = 0; x < g_config.map_width; x++) {
      for(var y = 0; y < g_config.map_height; y++) {
         if(g_map[x][y] != TILE_NONE) {
            drawTileShadow(new_ctx, x, y);
         }
      }
   }
   ctx.globalAlpha = TILE_SHADOW_TRANSPARENCY;
   ctx.drawImage(new_canvas, 0, 0);
   ctx.globalAlpha = 1.0;
}

function drawMap(ctx) {
   var tile_none  = document.getElementById('tile_none');
   var tile_rock  = document.getElementById('tile_rock');
   var tile_metal = document.getElementById('tile_metal');
   var x, y;
   for(x = 0; x < g_config.map_width; x++) {
      for(y = 0; y < g_config.map_height; y++) {
         if(g_map[x][y] == TILE_NONE) {
            ctx.drawImage(tile_none, (x * TILE_SIZE_PX), (y * TILE_SIZE_PX));
         }
      }
   }
   drawMapShadows(ctx);
   for(x = 0; x < g_config.map_width; x++) {
      for(y = 0; y < g_config.map_height; y++) {
         if(g_map[x][y] == TILE_ROCK) {
            ctx.drawImage(tile_rock, (x * TILE_SIZE_PX), (y * TILE_SIZE_PX));
         } else if(g_map[x][y] == TILE_METAL) {
            ctx.drawImage(tile_metal, (x * TILE_SIZE_PX), (y * TILE_SIZE_PX));
         }
      }
   }
}

//==============================================================================

function newBomb(player, x, y) {
   return {
      player: player,
      x: x,
      y: y,
      timetokill: BOMB_TIME_TO_KILL,
      alive: true
   };
}

function bombAt(x, y) {
   for(var ix = 0; ix < g_bombs.length; ix++) {
      if(g_bombs[ix].alive && (g_bombs[ix].x == x) && (g_bombs[ix].y == y)) {
         return g_bombs[ix];
      }
   }
   return null;
}

function bombDestroy(self) {
   if(self.alive) {
      self.alive = false;
      self.player.bombs += 1;
      doExplosion(self.x, self.y, self.player.range);
   }
}

function bombUpdate(self, dt) {
   self.timetokill -= dt;
   if(self.timetokill <= 0) {
      bombDestroy(self);
   }
   return !self.alive;
}

function bombDraw(self, ctx) {
   var anim_pos = (BOMB_TIME_TO_KILL - self.timetokill) / BOMB_TIME_TO_KILL;
   drawModelAtTile(ctx, model_bomb, self.x, self.y, anim_pos);
}

//==============================================================================

function generatePowerUps() {
   var possible_locations = [];
   for(var x = 0; x < g_config.map_width; x++) {
      for(var y = 0; y < g_config.map_height; y++) {
         if(getMapTile(x, y) == TILE_ROCK) {
            possible_locations.push([x, y]);
         }
      }
   }
   for(var cnt = 0; (cnt < (g_config.num_powerups * 2)) && (possible_locations.length > 0); cnt++){
      var ix = Math.floor(Math.random() * possible_locations.length);
      var powerup_kind = (cnt % 2) ? POWERUP_BOMB : POWERUP_RANGE;
      g_powerups.push(newPowerUp(powerup_kind, possible_locations[ix][0], possible_locations[ix][1]));
      possible_locations.splice(ix, 1);
   }
}

function newPowerUp(kind, x, y) {
   return {
      kind: kind,
      x: x,
      y: y,
      anim_pos: 0,
      alive: true
   };
}

function powerUpAt(x, y) {
   for(var ix = 0; ix < g_powerups.length; ix++) {
      if(g_powerups[ix].alive && (g_powerups[ix].x == x) && (g_powerups[ix].y == y)) {
         return g_powerups[ix];
      }
   }
   return null;
}

function powerUpDestroy(self) {
   self.alive = false;
}

function powerUpUpdate(self, dt) {
   var player = playerAt(self.x, self.y);
   if(player) {
      playerPickupPowerUp(player, self.kind);
      powerUpDestroy(self);
   } else {
      if(self.kind == POWERUP_BOMB) {
         self.anim_pos += (dt / POWERUP_BOMB_ANIM_LEN);
      } else if(self.kind == POWERUP_RANGE) {
         self.anim_pos += (dt / POWERUP_RANGE_ANIM_LEN);
      }
      if(self.anim_pos >= 1.0) {
         self.anim_pos -= 1.0;
      }
   }
   return !self.alive;
}

function powerUpDraw(self, ctx) {
   if(getMapTile(self.x, self.y) == TILE_NONE) {
      if(self.kind == POWERUP_BOMB) {
         drawModelAtTile(ctx, model_powerup_bomb, self.x, self.y, self.anim_pos);
      } else if(self.kind == POWERUP_RANGE) {
         drawModelAtTile(ctx, model_powerup_range, self.x, self.y, self.anim_pos);
      }
   }
}

//==============================================================================

function generatePlayers() {
   if(g_config.player1 != PLAYER_NONE) {
      g_players.push(newPlayer(PLAYER_1, g_config.map_width-1, 0));
   }
   if(g_config.player2 != PLAYER_NONE) {
      g_players.push(newPlayer(PLAYER_2, 0, g_config.map_height-1));
   }
   if(g_config.player3 != PLAYER_NONE) {
      g_players.push(newPlayer(PLAYER_3, 0, 0));
   }
   if(g_config.player4 != PLAYER_NONE) {
      g_players.push(newPlayer(PLAYER_4, g_config.map_width-1, g_config.map_height-1));
   }
}

function playerCopyModel(number, model) {
   if(number == PLAYER_1) {
      return model;
   } else {
      // Make a copy of the model. Clone polygon array, but don't clone other arrays, just copy their references.
      // We want to replace colors in the polygon array. We are not going to modify anything else.
      var newmodel = {};
      var polys = newmodel['polygons'] = cloneObject(model['polygons']);
      for(var attr in model) {
         if(!(attr in newmodel)) {
            newmodel[attr] = model[attr];
         }
      }
      // Make color substitutions.
      // The table below will most likely need to be updated if player models are changed.
      // Player 1 is blue, player 2 is purple, player 3 is green, player 4 is red.
      var color_substitutions = {
         // Eyes
         '#0080FF': ['#FF40FF', '#00E000', '#FF8080'],
         // Costume
         '#0040FF': ['#A000A0', '#008000', '#FF4040'],
         '#0020A0': ['#600060', '#004000', '#802020'],
         // Hair
         '#FFC000': ['#8080E0', '#FF8000', '#A0A0A0'],
         '#E0A000': ['#6060C0', '#E06000', '#808080'],
         '#C08000': ['#4040A0', '#C04000', '#606060']
      };
      for(var ix = 0; ix < polys.length; ix++) {
         var c = polys[ix][0].toUpperCase();
         if(c in color_substitutions) {
            polys[ix][0] = color_substitutions[c][number-PLAYER_2];
         }
      }
      return newmodel;
   }
}

function newPlayer(number, x, y) {
   var self = {
      number: number,
      x: x,
      y: y,
      direction: DIRECTION_NONE,
      delta_pos: 0.0,
      anim_pos: 0.0,
      range: 1,
      bombs: 1,
      model_back:  playerCopyModel(number, model_player_back),
      model_front: playerCopyModel(number, model_player_front),
      model_left:  playerCopyModel(number, model_player_left),
      model_right: playerCopyModel(number, model_player_right),
      model_dead:  playerCopyModel(number, model_player_dead),
      alive: true
   };
   if((number == PLAYER_1) && (g_config.player1 == PLAYER_HUMAN)) {
      self.human     = true;
      self.key_up    = KEY_UP;
      self.key_down  = KEY_DOWN;
      self.key_left  = KEY_LEFT;
      self.key_right = KEY_RIGHT;
      self.key_bomb  = KEY_ENTER;
      self.pressed_key_bomb = false;
   } else if((number == PLAYER_2) && (g_config.player2 == PLAYER_HUMAN)) {
      self.human     = true;
      self.key_up    = KEY_W;
      self.key_down  = KEY_S;
      self.key_left  = KEY_A;
      self.key_right = KEY_D;
      self.key_bomb  = KEY_Q;
      self.pressed_key_bomb = false;
   } else {
      self.human = false;
      aiInitPlayer(self);
   }
   return self;
}

function playerGetPos(self) {
   if(self.delta_pos > 0.5) {
      return {x: self.x + DX[self.direction], y: self.y + DY[self.direction]};
   } else {
      return {x: self.x, y: self.y};
   }
}

function playerAt(x, y) {
   for(var ix = 0; ix < g_players.length; ix++) {
      var pos = playerGetPos(g_players[ix]);
      if(g_players[ix].alive && (pos.x == x) && (pos.y == y)) {
         return g_players[ix];
      }
   }
   return null;
}

function playerKill(self) {
   self.alive = false;
}

function playerPickupPowerUp(self, powerup_kind) {
   if(powerup_kind == POWERUP_BOMB) {
      self.bombs += 1;
   } else if(powerup_kind == POWERUP_RANGE) {
      self.range += 1;
   }
}

function playerDetermineDirection(self, dt) {
   if(self.human) {
      if((self.key_up in g_keyboard) && g_keyboard[self.key_up]) {
         return DIRECTION_UP;
      } else if((self.key_down in g_keyboard) && g_keyboard[self.key_down]) {
         return DIRECTION_DOWN;
      } else if((self.key_left in g_keyboard) && g_keyboard[self.key_left]) {
         return DIRECTION_LEFT;
      } else if((self.key_right in g_keyboard) && g_keyboard[self.key_right]) {
         return DIRECTION_RIGHT;
      } else {
         return DIRECTION_NONE;
      }
   } else {
      return aiThinkMovement(self, dt);
   }
}

function playerDetermineSetBomb(self) {
   if(self.human) {
      var result = false;
      if((self.key_bomb in g_keyboard) && g_keyboard[self.key_bomb] && !self.pressed_key_bomb) {
         self.pressed_key_bomb = true;
         result = true;
      } else if(!(self.key_bomb in g_keyboard) || !g_keyboard[self.key_bomb]) {
         self.pressed_key_bomb = false;
      }
      return result;
   } else {
      return aiThinkSetBomb(self);
   }
}

function playerUpdate(self, dt) {
   if(self.alive) {
      self.delta_pos += (dt * PLAYER_SPEED);
      if((self.direction == DIRECTION_NONE) || (self.delta_pos >= 1.0)) {
         self.delta_pos = 0.0;
         self.x += DX[self.direction];
         self.y += DY[self.direction];
         var newdir = playerDetermineDirection(self, dt);
         if((newdir != DIRECTION_NONE) && (getMapTile(self.x + DX[newdir], self.y + DY[newdir]) == TILE_NONE) && !bombAt(self.x + DX[newdir], self.y + DY[newdir])) {
            self.direction = newdir;
         } else {
            self.direction = DIRECTION_NONE;
         }
      } else if((self.delta_pos > 0) && (self.delta_pos < 0.5)) {
         if(bombAt(self.x + DX[self.direction], self.y + DY[self.direction])) {
            self.direction = DIRECTION_NONE;
            self.delta_pos = 0;
         }
      }
      if((self.bombs > 0) && playerDetermineSetBomb(self)) {
         var pos = playerGetPos(self);
         if(!bombAt(pos.x, pos.y)) {
            g_bombs.push(newBomb(self, pos.x, pos.y));
            self.bombs -= 1;
         }
      }
   } else if(self.anim_pos < 1.0) {
      self.anim_pos += (dt / PLAYER_DEAD_ANIM_LEN);
   }
}

function playerDraw(self, ctx) {
   var x = self.x + (DX[self.direction] * self.delta_pos);
   var y = self.y + (DY[self.direction] * self.delta_pos);
   if(self.alive) {
      if       (self.direction == DIRECTION_UP)    { drawModelAtTile(ctx, self.model_back,  x, y, self.delta_pos);
      } else if(self.direction == DIRECTION_DOWN)  { drawModelAtTile(ctx, self.model_front, x, y, self.delta_pos);
      } else if(self.direction == DIRECTION_LEFT)  { drawModelAtTile(ctx, self.model_left,  x, y, self.delta_pos);
      } else if(self.direction == DIRECTION_RIGHT) { drawModelAtTile(ctx, self.model_right, x, y, self.delta_pos);
      } else                                       { drawModelAtTile(ctx, self.model_front, x, y, self.delta_pos);
      }
   } else {
      drawModelAtTile(ctx, self.model_dead, x, y, self.anim_pos);
   }
}

//==============================================================================

function doExplosion(x, y, range) {
   g_explosions.push(newExplosion(0, x, y));
   for(var dir = DIRECTION_UP; dir <= DIRECTION_RIGHT; dir++) {
      for(var exit = false, ix = 1; !exit && (ix <= range); ix++) {
         var tile = getMapTile(x + DX[dir]*ix, y + DY[dir]*ix);
         exit = true;
         if((tile == TILE_NONE) || (tile == TILE_ROCK)) {
            g_explosions.push(newExplosion(ix, x + DX[dir]*ix, y + DY[dir]*ix));
            if(tile == TILE_NONE) {
               exit = false;
            }
         }
      }
   }
}

function newExplosion(distance_from_center, x, y) {
   return {
      x: x,
      y: y,
      timetospawn: EXPL_TIME_TO_SPAWN * distance_from_center,
      timetokill: EXPL_TIME_TO_KILL,
   };
}

function explosionUpdate(self, dt) {
   if(self.timetospawn >= 0) {
      self.timetospawn -= dt;
      if(self.timetospawn < 0) {
         if(getMapTile(self.x, self.y) == TILE_NONE) {
            var powerup = powerUpAt(self.x, self.y);
            if(powerup) powerUpDestroy(powerup);
         } else if(getMapTile(self.x, self.y) == TILE_ROCK) {
            destroyMapTile(self.x, self.y);
         }
      }
   } else if(self.timetokill >= 0) {
      self.timetokill -= dt;
      var bomb = bombAt(self.x, self.y);
      if(bomb) bombDestroy(bomb);
      var player;
      while((player = playerAt(self.x, self.y)) != null) {
         playerKill(player);
      }
   } else {
      return true;
   }
   return false;
}

function explosionDraw(self, ctx) {
   if(self.timetospawn <= 0) {
      var anim_pos = (EXPL_TIME_TO_KILL - self.timetokill) / EXPL_TIME_TO_KILL;
      drawModelAtTile(ctx, model_explosion, self.x, self.y, anim_pos);
   }
}

//==============================================================================

function updateGame(dt) {
   var ix;
   for(ix = 0; ix < g_bombs.length; ) {
      if(bombUpdate(g_bombs[ix], dt)) {
         g_bombs.splice(ix, 1);
      } else {
         ix += 1;
      }
   }
   for(ix = 0; ix < g_powerups.length; ) {
      if(powerUpUpdate(g_powerups[ix], dt)) {
         g_powerups.splice(ix, 1);
      } else {
         ix += 1;
      }
   }
   for(ix = 0; ix < g_players.length; ix++) {
      playerUpdate(g_players[ix], dt);
   }
   for(ix = 0; ix < g_explosions.length; ) {
      if(explosionUpdate(g_explosions[ix], dt)) {
         g_explosions.splice(ix, 1);
      } else {
         ix += 1;
      }
   }
}

function drawGame() {
   var ctx_bg = document.getElementById('bg').getContext('2d');
   var ctx_fg = document.getElementById('fg').getContext('2d');
   var ix;
   if(g_map_redraw) {
      g_map_redraw = false;
      drawMap(ctx_bg);
   }
   ctx_fg.clearRect(0, 0, (g_config.map_width * TILE_SIZE_PX), (g_config.map_height * TILE_SIZE_PX));
   for(ix = 0; ix < g_players.length; ix++) {
      if(!g_players[ix].alive) {
         playerDraw(g_players[ix], ctx_fg);
      }
   }
   for(ix = 0; ix < g_bombs.length; ix++) {
      bombDraw(g_bombs[ix], ctx_fg);
   }
   for(ix = 0; ix < g_powerups.length; ix++) {
      powerUpDraw(g_powerups[ix], ctx_fg);
   }
   for(ix = 0; ix < g_players.length; ix++) {
      if(g_players[ix].alive) {
         playerDraw(g_players[ix], ctx_fg);
      }
   }
   for(ix = 0; ix < g_explosions.length; ix++) {
      explosionDraw(g_explosions[ix], ctx_fg);
   }
}

function tick(timestamp) {
   var dt = (g_timestamp > 0) ? ((timestamp - g_timestamp) / 1000.0) : 0;
   g_timestamp = timestamp;
   if(!g_menu.active) {
      updateGame(dt);
   }
   drawGame();
   if(g_menu.active) {
      drawMenu();
   }
   window.requestAnimationFrame(tick);
}

function keydown(evt) {
   if(evt.keyCode == KEY_ESC){
      g_menu.active = !g_menu.active;
   } else if(g_menu.active) {
      updateMenuKey(evt.keyCode);
   } else {
      g_keyboard[evt.keyCode] = true;
   }
}

function keyup(evt) {
   g_keyboard[evt.keyCode] = false;
}

function getMousePos(evt) {
   var rect = document.getElementById('fg').getBoundingClientRect();
   var x = evt.clientX - rect.left;
   var y = evt.clientY - rect.top;
   return [x, y];
}

function mousemove(evt) {
   if(g_menu.active) {
      updateMenuMouse(getMousePos(evt), false);
   }
}

function mouseclick(evt) {
   if(g_menu.active) {
      updateMenuMouse(getMousePos(evt), true);
   } else {
      g_menu.active = true;
   }
}

function startGame() {
   createConfiguration();
   var canvas_list = ['bg', 'fg'];
   for(var ix = 0; ix < canvas_list.length; ix++) {
      var canvas = document.getElementById(canvas_list[ix]);
      canvas.width  = g_config.map_width  * TILE_SIZE_PX;
      canvas.height = g_config.map_height * TILE_SIZE_PX;
   }
   g_menu.active = false;
   g_map_redraw  = true;
   g_map         = [];
   g_bombs       = [];
   g_powerups    = [];
   g_players     = [];
   g_explosions  = [];
   generateMap();
   generatePowerUps();
   generatePlayers();
}

function main() {
   initModel(model_bomb);
   initModel(model_explosion);
   initModel(model_powerup_bomb);
   initModel(model_powerup_range);
   initModel(model_player_back);
   initModel(model_player_front);
   initModel(model_player_left);
   initModel(model_player_right);
   initModel(model_player_dead);
   createMenu();
   startGame();
   g_menu.active = false;
   document.onkeydown = keydown;
   document.onkeyup = keyup;
   document.onmousemove = mousemove;
   document.onclick = mouseclick;
   window.requestAnimationFrame(tick);
}
