#include <SDL2/SDL.h>
#include <emscripten/emscripten.h>
static SDL_Window *window;
static SDL_Renderer *renderer;
static int x=0;
void frame(void){
 SDL_Event e; while(SDL_PollEvent(&e)){if(e.type==SDL_QUIT)emscripten_cancel_main_loop();}
 SDL_SetRenderDrawColor(renderer,15,20,35,255); SDL_RenderClear(renderer);
 SDL_Rect r={x,90,60,60}; SDL_SetRenderDrawColor(renderer,255,185,60,255);
 SDL_RenderFillRect(renderer,&r); SDL_RenderPresent(renderer); x=(x+2)%640;
}
int main(void){
 if(SDL_Init(SDL_INIT_VIDEO)!=0)return 1;
 window=SDL_CreateWindow("JS C SDL2",SDL_WINDOWPOS_CENTERED,SDL_WINDOWPOS_CENTERED,640,240,0);
 renderer=SDL_CreateRenderer(window,-1,SDL_RENDERER_SOFTWARE);
 emscripten_set_main_loop(frame,60,1); return 0;
}
