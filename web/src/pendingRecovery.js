/** 创建成功后跨路由传递恢复链接（内存态，不落盘、不进 URL） */
let data = null;

export function setPendingRecovery(d) {
  data = d;
}

export function takePendingRecovery() {
  const d = data;
  data = null;
  return d;
}
