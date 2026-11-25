/** Fail during screen setup if the HTML no longer satisfies the control's DOM contract. */
export function requireElement<T extends Element>(
  root: ParentNode,
  selector: string,
  type: { new (): T },
): T {
  const element = root.querySelector(selector);
  if (!(element instanceof type)) throw new Error(`Missing or unexpected element: ${selector}`);
  return element;
}
