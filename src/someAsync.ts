export const someAsync = async <T>(
  items: T[],
  callback: (it: T, i: number) => boolean | Promise<boolean>,
) => {
  for (let i = 0, l = items.length; i < l; i++) {
    const item = await items[i];
    const result = await callback(item, i);

    if (result) {
      return true;
    }
  }

  return false;
};
