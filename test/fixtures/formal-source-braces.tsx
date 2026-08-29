export function BraceFixture() {
  const stringBrace = "}";
  const templateBrace = `template ${"{"} and }`;
  // A comment brace must not close the component: }
  return <div>{stringBrace}{templateBrace}FORMAL_COMPONENT_SENTINEL</div>;
}

export function BraceRouteFixture(path: string) {
  if (path === "/fixture") {
    const stringBrace = "}";
    const templateBrace = `route ${"{"} and }`;
    /* A block-comment brace must not close the route: } */
    return `${stringBrace}${templateBrace}FORMAL_ROUTE_SENTINEL`;
  }
  return null;
}
