// A generic, minimal XML-to-JSON converter: every element becomes an
// object keyed by tag name (attributes under `.attr`, text content under
// `.value`), with repeated sibling tags collapsed into an array - enough
// to walk a WCS DescribeCoverage response the same way @opengeoweb/webmap
// already walks WMS GetCapabilities XML internally.
export interface XmlJsonNode {
  value?: string;
  attr: Record<string, string>;
  [childTagName: string]:
    XmlJsonNode | XmlJsonNode[] | string | Record<string, string> | undefined;
}

const traverseXmlChildren = (
  parent: Document | Element,
  draftJson: XmlJsonNode,
): void => {
  Array.from(parent.children).forEach((child) => {
    const { nodeName } = child;
    const newNode: XmlJsonNode = { attr: {} };

    const firstChild = child.childNodes[0];
    if (firstChild?.nodeValue) {
      const value = firstChild.nodeValue.trim();
      if (value.length > 0) {
        newNode.value = value;
      }
    }

    Array.from(child.attributes).forEach((attribute) => {
      newNode.attr[attribute.name] = attribute.value;
    });

    const existing = draftJson[nodeName];
    if (existing === undefined) {
      draftJson[nodeName] = newNode;
    } else if (Array.isArray(existing)) {
      existing.push(newNode);
    } else {
      draftJson[nodeName] = [existing as XmlJsonNode, newNode];
    }

    traverseXmlChildren(child, newNode);
  });
};

export const xmlToJson = (document: Document): XmlJsonNode => {
  const draftJson: XmlJsonNode = { attr: {} };
  traverseXmlChildren(document, draftJson);
  return draftJson;
};
