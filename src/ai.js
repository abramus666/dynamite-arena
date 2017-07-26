
var SCORE_MYSELF     = 100;
var SCORE_PLAYERKILL = 1000;
var SCORE_PLAYER     = 50;
var SCORE_POWERUP    = 75;
var SCORE_WALL       = 5;

var GOAL_MISMATCH_PENALTY = 0.1;

var NOTHINK_DELAY = 0.1;

//==============================================================================

function aiGenerateMapInfo() {
   var map_info = [];
   for(var x = 0; x < g_config.map_width; x++) {
      map_info.push([]);
      for(var y = 0; y < g_config.map_height; y++) {
         map_info[x].push({
            x: x,
            y: y,
            directions: [],
            num_players: 0,
            num_powerups: 0,
            expl_bomb: false, // If true, explosion or bomb is in place.
            expl_area: -1,    // If positive, place is in explosion range of a nearby bomb.
            path_init_dir: null,
            path_tile_cnt: null
         });
      }
   }
   return map_info;
}

function aiMapInfoAddPlayers(map_info, player) {
   var cnt = 0;
   for(var ix = 0; ix < g_players.length; ix++) {
      if((g_players[ix] != player) && g_players[ix].alive) {
         var x = g_players[ix].x;
         var y = g_players[ix].y;
         map_info[x][y].num_players += 1;
         cnt += 1;
      }
   }
   return cnt;
}

function aiMapInfoAddPowerUps(map_info) {
   var cnt = 0;
   for(var ix = 0; ix < g_powerups.length; ix++) {
      var x = g_powerups[ix].x;
      var y = g_powerups[ix].y;
      if(g_map[x][y] == TILE_NONE) { // PowerUps are added only if they are visible.
         map_info[x][y].num_powerups += 1;
         cnt += 1;
      }
   }
   return cnt;
}

function aiSetExplosionArea(tile_info, delay) {
   if((tile_info.expl_area < 0) || (tile_info.expl_area > delay)) {
      tile_info.expl_area = delay;
   }
}

function aiMapInfoAddBomb(map_info, start_x, start_y, timetokill, bomb_range) {
   // Decrease timetokill if bomb will prematurely explode due to another nearby bomb.
   // New bombs are always added at the end of array, so bombs with an earlier explode
   // time are guaranteed to be already processed.
   if(!(map_info[start_x][start_y].expl_area < 0) && (timetokill > map_info[start_x][start_y].expl_area)) {
      timetokill = map_info[start_x][start_y].expl_area;
   }
   map_info[start_x][start_y].expl_bomb = true;
   aiSetExplosionArea(map_info[start_x][start_y], timetokill);
   for(var dir = DIRECTION_UP; dir <= DIRECTION_RIGHT; dir++) {
      for(var ix = 1; ix <= bomb_range; ix++) {
         var x = start_x + DX[dir]*ix;
         var y = start_y + DY[dir]*ix;
         // Tiles with destructible walls are not marked, but that's ok as players cannot move there anyway.
         if(getMapTile(x, y) == TILE_NONE) {
            aiSetExplosionArea(map_info[x][y], (timetokill + (ix * EXPL_TIME_TO_SPAWN)));
         } else {
            break;
         }
      }
   }
}

function aiMapInfoAddDangerAreas(map_info) {
   var ix, x, y;
   for(ix = 0; ix < g_bombs.length; ix++) {
      x = g_bombs[ix].x;
      y = g_bombs[ix].y;
      aiMapInfoAddBomb(map_info, x, y, g_bombs[ix].timetokill, g_bombs[ix].player.range);
   }
   for(var ix = 0; ix < g_explosions.length; ix++) {
      x = g_explosions[ix].x;
      y = g_explosions[ix].y;
      if(g_explosions[ix].timetospawn > 0) { // Explosion not spawned yet.
         aiSetExplosionArea(map_info[x][y], g_explosions[ix].timetospawn);
      } else {
         map_info[x][y].expl_bomb = true;
      }
   }
}

function aiMapInfoAddDirections(map_info) {
   for(var x = 0; x < g_config.map_width; x++) {
      for(var y = 0; y < g_config.map_height; y++) {
         if(getMapTile(x, y) == TILE_NONE) {
            for(var dir = DIRECTION_UP; dir <= DIRECTION_RIGHT; dir++) {
               var dst_x = x + DX[dir];
               var dst_y = y + DY[dir];
               // No directions into walls, explosions, and bombs.
               if((getMapTile(dst_x, dst_y) == TILE_NONE) && !map_info[dst_x][dst_y].expl_bomb) {
                  map_info[x][y].directions.push(dir);
               }
            }
         }
      }
   }
}

//==============================================================================

function aiGetNeighbor(map_info, tile_info, direction) {
   var x = tile_info.x + DX[direction];
   var y = tile_info.y + DY[direction];
   return map_info[x][y];
}

function aiTraverseMap(map_info, tile_info, traverse_functions) {
   tile_info.path_init_dir = DIRECTION_NONE;
   tile_info.path_tile_cnt = 0;
   var frontier = [tile_info];
   while(frontier.length > 0) {
      var cur = frontier.shift();
      for(var func_ix = 0; func_ix < traverse_functions.length; func_ix++) {
         if(!traverse_functions[func_ix](cur)) { // Stop traversal when function returns false.
            return false;
         }
      }
      for(var dir_ix = 0; dir_ix < cur.directions.length; dir_ix++) {
         var dir = cur.directions[dir_ix];
         var nxt = aiGetNeighbor(map_info, cur, dir);
         if(nxt.path_init_dir == null) {
            // Don't allow to move into an explosion area, unless it is possible to escape before it starts.
            if(!nxt.expl_bomb && ((nxt.expl_area < 0) || (nxt.expl_area > (cur.path_tile_cnt + 1.5) / PLAYER_SPEED))) {
               if(cur.path_init_dir != DIRECTION_NONE) {
                  nxt.path_init_dir = cur.path_init_dir;
                  nxt.path_tile_cnt = cur.path_tile_cnt + 1;
               } else {
                  nxt.path_init_dir = dir;
                  nxt.path_tile_cnt = 1;
               }
               frontier.push(nxt);
            }
         }
      }
   }
   return true; // Return true when traversal was not prematurely stopped.
}

//==============================================================================

function aiNewGoal(score, destination) {
   return {
      score: score,
      dst: destination
   };
}

function aiIsSettingBombSafe(player, player_to_check) {
   var map_info = cloneObject(player.ai.map_info);
   aiMapInfoAddBomb(map_info, player.x, player.y, BOMB_TIME_TO_KILL, player.range);

   function traverseFunc(tile_info) {
      return ((tile_info.expl_area < 0) ? false : true);
   }

   return !aiTraverseMap(map_info, map_info[player_to_check.x][player_to_check.y], [traverseFunc]);
}

function aiDetermineGoals(player) {
   var map_info      = cloneObject(player.ai.map_info);
   var goals_escape  = player.ai.goals_escape;
   var goals_pickup  = player.ai.goals_pickup;
   var goals_setbomb = player.ai.goals_setbomb;

   function scoreDistanceFactor(tile_info) {
      return 1.0 / (1 + tile_info.path_tile_cnt);
   }

   function traverseFunc_Escape(tile_info) {
      if(tile_info.expl_area < 0) {
         var dir = tile_info.path_init_dir;
         var score = SCORE_MYSELF * scoreDistanceFactor(tile_info);
         if(!(dir in goals_escape) || (score > goals_escape[dir].score)) {
            goals_escape[dir] = aiNewGoal(score, tile_info);
         }
      }
      return true; // Continue traversal.
   }

   function traverseFunc_PickUp(tile_info) {
      if(tile_info.num_powerups > 0) {
         var dir = tile_info.path_init_dir;
         var score = (tile_info.num_powerups * SCORE_POWERUP) * scoreDistanceFactor(tile_info);
         if(!(dir in goals_pickup) || (score > goals_pickup[dir].score)) {
            goals_pickup[dir] = aiNewGoal(score, tile_info);
         }
      }
      return true; // Continue traversal.
   }

   function calculateSetBombScore(tile_info, num_players, num_powerups, num_walls) {
      // If we are already at location where the bomb is supposed to be put,
      // check whether it is safe to do so. If not, don't add a goal.
      var score = (num_walls * SCORE_WALL) - (num_powerups * SCORE_POWERUP);
      if(tile_info.path_tile_cnt == 0) {
         if(aiIsSettingBombSafe(player, player)) {
            // If putting a bomb here is guaranteed to kill a player (at least
            // according to our predictions), give a really huge score to this goal.
            var num_playerkills = 0;
            for(var ix = 0; ix < g_players.length; ix++) {
               if(g_players[ix].alive && (g_players[ix] != player) && !aiIsSettingBombSafe(player, g_players[ix])) {
                  num_playerkills += 1;
               }
            }
            score += (num_playerkills * SCORE_PLAYERKILL) + ((num_players - num_playerkills) * SCORE_PLAYER);
         } else {
            score = 0;
         }
      } else {
         score += (num_players * SCORE_PLAYER);
         score *= scoreDistanceFactor(tile_info);
      }
      return score;
   }

   function traverseFunc_SetBomb(tile_info) {
      if(!tile_info.expl_bomb) { // Nothing to do if there is already a bomb here.
         var num_players  = 0;
         var num_powerups = 0;
         var num_walls    = 0;
         var x = tile_info.x;
         var y = tile_info.y;
         var dir, ix;
         num_players  += map_info[x][y].num_players;
         num_powerups += map_info[x][y].num_powerups;
         for(dir = DIRECTION_UP; dir <= DIRECTION_RIGHT; dir++) {
            for(ix = 1; ix <= player.range; ix++) {
               x = tile_info.x + DX[dir]*ix;
               y = tile_info.y + DY[dir]*ix;
               var tile = getMapTile(x, y);
               if(tile == TILE_ROCK) {
                  num_walls += 1;
               }
               if(tile == TILE_NONE) {
                  num_players  += map_info[x][y].num_players;
                  num_powerups += map_info[x][y].num_powerups;
               } else {
                  break;
               }
            }
         }
         var score = calculateSetBombScore(tile_info, num_players, num_powerups, num_walls);
         if(score > 0) {
            dir = tile_info.path_init_dir;
            if(!(dir in goals_setbomb) || (score > goals_setbomb[dir].score)) {
               goals_setbomb[dir] = aiNewGoal(score, tile_info);
            }
         }
      }
      return true; // Continue traversal.
   }

   var start_location = map_info[player.x][player.y];
   var traverse_functions = [];
   if(!(start_location.expl_area < 0)) {
      traverse_functions.push(traverseFunc_Escape);
   }
   if(player.ai.num_powerups > 0) {
      traverse_functions.push(traverseFunc_PickUp);
   }
   if(player.bombs > 0) {
      traverse_functions.push(traverseFunc_SetBomb);
   }
   aiTraverseMap(map_info, start_location, traverse_functions);
}

//==============================================================================

function aiInitPlayer(player) {
   player.ai = {
      delay: 0,
      saved_goal: null
   };
}

function aiInitPlayerNewRound(player) {
   var ai = player.ai;
   ai.map_info = aiGenerateMapInfo();
   ai.num_players = aiMapInfoAddPlayers(ai.map_info, player);
   ai.num_powerups = aiMapInfoAddPowerUps(ai.map_info);
   aiMapInfoAddDangerAreas(ai.map_info);
   aiMapInfoAddDirections(ai.map_info);
   ai.goals_escape = {};
   ai.goals_pickup = {};
   ai.goals_setbomb = {};
   ai.setbomb_goal = null;
   if(ai.saved_goal && (player.x == ai.saved_goal.dst.x) && (player.y == ai.saved_goal.dst.y)) {
      ai.saved_goal = null;
   }
}

function aiCountScores(player) {
   var ai = player.ai;

   // Directions that don't continue saved goal are given a penalty. This is to avoid
   // stupid behavior like going forwards and backwards over and over again without
   // actually doing something useful. (Caused by randomness of goal selection.)
   function updatedScore(goal) {
      if(ai.saved_goal && ((goal.dst.x != ai.saved_goal.dst.x) || (goal.dst.y != ai.saved_goal.dst.y))) {
         return (goal.score * GOAL_MISMATCH_PENALTY);
      } else {
         return goal.score;
      }
   }

   // If we must escape from an explosion, only directions which are possible
   // escape routes are taken into account, with an exception of DIRECTION_NONE.
   // (This is so that we can put bomb where we stand now before escaping.)
   // Otherwise, all directions are taken into account.
   var dir, dir_score_pairs = [];
   for(dir in ai.goals_escape) {
      dir_score_pairs.push([dir, ai.goals_escape[dir].score]);
   }
   if(dir_score_pairs.length == 0){
      for(dir = DIRECTION_NONE; dir <= DIRECTION_RIGHT; dir++) {
         dir_score_pairs.push([dir, 0]);
      }
   } else {
      dir_score_pairs.push([DIRECTION_NONE, 0]); // DIRECTION_NONE should never occur in goals_escape.
   }
   for(var ix = 0; ix < dir_score_pairs.length; ix++) {
      dir = dir_score_pairs[ix][0];
      if(dir in ai.goals_pickup) {
         dir_score_pairs[ix][1] += updatedScore(ai.goals_pickup[dir]);
      }
      if(dir in ai.goals_setbomb) {
         dir_score_pairs[ix][1] += updatedScore(ai.goals_setbomb[dir]);
      }
   }
   return dir_score_pairs;
}

// Select movement direction from the possible ones, based on their overall scores.
// (Direction is more likely to be selected when its score is larger.)
function aiSelectMovementDirection(player) {
   var dir_score_pairs = aiCountScores(player);
   var sum_scores = 0;
   var ix;
   for(ix = 0; ix < dir_score_pairs.length; ix++) {
      sum_scores += dir_score_pairs[ix][1];
   }
   var value = sum_scores * Math.random();
   for(ix = 0; ix < dir_score_pairs.length; ix++) {
      value -= dir_score_pairs[ix][1];
      if(value < 0) {
         return dir_score_pairs[ix][0];
      }
   }
   return DIRECTION_NONE; // Should not happen unless there are no goals.
}

function aiHighestScoreGoal(player, dir) {
   var ai = player.ai;
   var saved_goal = null;
   var saved_score = 0;
   if((dir in ai.goals_escape) && (saved_score < ai.goals_escape[dir].score)) {
      saved_goal = ai.goals_escape[dir];
      saved_score = saved_goal.score;
   }
   if((dir in ai.goals_pickup) && (saved_score < ai.goals_pickup[dir].score)) {
      saved_goal = ai.goals_pickup[dir];
      saved_score = saved_goal.score;
   }
   if((dir in ai.goals_setbomb) && (saved_score < ai.goals_setbomb[dir].score)) {
      saved_goal = ai.goals_setbomb[dir];
      saved_score = saved_goal.score;
   }
   return saved_goal;
}

function aiThinkMovement(player, dt) {
   var dir = DIRECTION_NONE;
   var ai = player.ai;
   if(ai.delay > 0) {
      ai.delay -= dt;
   } else {
      aiInitPlayerNewRound(player);
      aiDetermineGoals(player);
      dir = aiSelectMovementDirection(player);
      ai.saved_goal = aiHighestScoreGoal(player, dir);
      if(dir in ai.goals_setbomb) {
         ai.setbomb_goal = ai.goals_setbomb[dir];
      }
      if(dir == DIRECTION_NONE) {
         ai.delay = NOTHINK_DELAY; // Add delay to avoid calling this function every frame.
      }
   }
   return dir;
}

function aiThinkSetBomb(player) {
   var ai = player.ai;
   if(ai.setbomb_goal && (player.x == ai.setbomb_goal.dst.x) && (player.y == ai.setbomb_goal.dst.y)) {
      ai.setbomb_goal = null;
      return true;
   } else {
      return false;
   }
}
