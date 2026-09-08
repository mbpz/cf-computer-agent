export function shouldAutoLoadScene(options: {
  reduceMotion: boolean;
  saveData: boolean;
  staticMode: boolean;
}): boolean {
  return !options.reduceMotion && !options.saveData && !options.staticMode;
}
