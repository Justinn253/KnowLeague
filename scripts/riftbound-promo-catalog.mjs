function getExtendedDataValue(product, fieldName) {
  const field = (product.extendedData ?? []).find(
    (entry) => String(entry.name).toLowerCase() === fieldName.toLowerCase(),
  );
  return typeof field?.value === "string" ? field.value : null;
}
function parseCardNumber(cardNumber) {
  const [rawCollectorNumber, rawPrintedTotal] = String(cardNumber).split("/");
  const collectorNumber = rawCollectorNumber.trim().toUpperCase();
  const printedTotal = /^\d+$/.test(String(rawPrintedTotal ?? "").trim())
    ? Number(rawPrintedTotal)
    : null;
  return {
    collectorNumber,
    printedTotal,
    numberLabel:
      printedTotal === null
        ? collectorNumber
        : `${collectorNumber}/${printedTotal}`,
  };
}
function parseNumberValue(value) {
  const parsed = Number(String(value ?? "").trim());
  return Number.isFinite(parsed) && parsed >= 0 ? parsed : 0;
}
function parseListValue(value, fallback = []) {
  const values = String(value ?? "")
    .split(/[;,]/)
    .map((entry) => entry.trim())
    .filter(Boolean)
    .filter((entry) => entry.toLowerCase() !== "none");
  return values.length > 0 ? values : fallback;
}
function stripHtml(value) {
  return String(value ?? "")
    .replace(/<br\s*\/?>(\r?\n)?/gi, "\n")
    .replace(/<[^>]*>/g, "")
    .replace(/&amp;/gi, "&")
    .replace(/&quot;/gi, '"')
    .replace(/&#39;|&apos;/gi, "'")
    .replace(/&lt;/gi, "<")
    .replace(/&gt;/gi, ">")
    .replace(/\r\n/g, "\n")
    .trim();
}
function parseCardType(value) {
  const rawValue = String(value ?? "").trim();
  const baseType = [
    "Legend",
    "Rune",
    "Battlefield",
    "Unit",
    "Spell",
    "Gear",
  ].find((type) =>
    new RegExp(`(?:^|[; ])${type}(?:$|[; ])`, "i").test(rawValue),
  );
  const cardType = baseType ?? "Token";
  const cardTypeLabels = [cardType];
  if (/Champion/i.test(rawValue)) cardTypeLabels.push("Champion");
  if (/Signature/i.test(rawValue)) cardTypeLabels.push("Signature");
  if (/Basic/i.test(rawValue)) cardTypeLabels.push("Basic");
  return { cardType, cardTypeLabels };
}
function normalizePrintKey(value) {
  const [printCode] = String(value).toUpperCase().split("/");
  const separatorIndex = printCode.indexOf("-");
  if (separatorIndex === -1) return printCode;
  const setCode = printCode.slice(0, separatorIndex);
  const collectorNumber = printCode
    .slice(separatorIndex + 1)
    .replace(/-STAR$/, "*");
  return `${setCode}:${collectorNumber}`;
}
function getPromoOverride(promoManifest, groupCode, productId) {
  return (
    promoManifest.collectorNumberOverrides.find(
      (override) =>
        String(override.setCode).toUpperCase() ===
          String(groupCode).toUpperCase() &&
        Number(override.sourceProductId) === Number(productId),
    ) ?? null
  );
}
function getPriceValue(productPrices, finish) {
  return productPrices?.[finish] ?? productPrices?.get?.(finish) ?? null;
}
function getPromoPriceValues(
  productPrices,
  marketPrice,
  snapshotDate,
  productName,
) {
  const sourceFinishes =
    productPrices?.finishes instanceof Set
      ? Array.from(productPrices.finishes)
      : [];
  const defaultFinish = /\bmetal\b|\bprize wall\b/i.test(productName)
    ? "normal"
    : "foil";
  const finishOptions =
    sourceFinishes.length > 0 ? sourceFinishes : [defaultFinish];
  const marketPrices = {
    normal: getPriceValue(productPrices, "normal"),
    foil: getPriceValue(productPrices, "foil"),
    updatedAt:
      sourceFinishes.length > 0
        ? snapshotDate
        : (marketPrice?.marketPriceUpdatedAt ?? null),
  };
  return {
    marketPrices,
    marketPrice:
      marketPrices.normal ??
      marketPrices.foil ??
      marketPrice?.marketPrice ??
      null,
    marketPriceUpdatedAt: marketPrices.updatedAt,
    finishOptions,
    defaultFinish: finishOptions.includes(defaultFinish)
      ? defaultFinish
      : finishOptions[0],
  };
}
export function createTcgCsvPromoCards(
  promoManifest,
  tcgProducts,
  marketPriceByPrintKey,
  snapshotDate,
) {
  const promoGroups = new Map(
    promoManifest.tcgcsvGroups.map((group) => [
      String(group.setCode).toUpperCase(),
      group,
    ]),
  );
  const seenProductIds = new Set();
  const cards = [];
  for (const { groupCode, groupName, product, productPrices } of tcgProducts) {
    const normalizedGroupCode = String(groupCode).toUpperCase();
    const group = promoGroups.get(normalizedGroupCode);
    if (
      !group ||
      getExtendedDataValue(product, "Rarity")?.toLowerCase() !==
        String(group.includeRarity).toLowerCase()
    )
      continue;
    if (seenProductIds.has(product.productId))
      throw new Error(
        `Duplicate Riftbound promo source product ${product.productId}.`,
      );
    seenProductIds.add(product.productId);
    const override = getPromoOverride(
      promoManifest,
      normalizedGroupCode,
      product.productId,
    );
    const rawCardNumber =
      override?.collectorNumber ?? getExtendedDataValue(product, "Number");
    if (!rawCardNumber) {
      throw new Error(
        `Promo product ${product.productId} (${product.name}) has no collector number; add a collectorNumberOverrides entry.`,
      );
    }
    if (!product.imageUrl) {
      throw new Error(
        `Promo product ${product.productId} (${product.name}) has no image URL.`,
      );
    }
    const number = override?.collectorNumber
      ? {
          collectorNumber: override.collectorNumber,
          printedTotal: null,
          numberLabel: override.collectorNumber,
        }
      : parseCardNumber(rawCardNumber);
    const cardType = parseCardType(getExtendedDataValue(product, "Card Type"));
    const marketPrice = marketPriceByPrintKey.get(
      normalizePrintKey(`${normalizedGroupCode}-${number.collectorNumber}`),
    );
    const prices = getPromoPriceValues(
      productPrices,
      marketPrice,
      snapshotDate,
      product.name,
    );
    const displayName = String(product.name ?? "").trim();
    const card = {
      id: `${normalizedGroupCode.toLowerCase()}-${product.productId}`,
      sourceProductId: product.productId,
      displayName,
      name: displayName,
      fullName: displayName,
      setCode: normalizedGroupCode,
      setName: groupName || group.setName || normalizedGroupCode,
      collectorNumber: number.collectorNumber,
      printedTotal: number.printedTotal,
      numberLabel: number.numberLabel,
      rarity: "Promo",
      energyCost: parseNumberValue(
        getExtendedDataValue(product, "Energy Cost"),
      ),
      powerCost: parseNumberValue(getExtendedDataValue(product, "Power Cost")),
      might: parseNumberValue(getExtendedDataValue(product, "Might")),
      cardType: cardType.cardType,
      cardTypeLabels: cardType.cardTypeLabels,
      imageAvailable: Number(product.imageCount) > 0,
      tags: parseListValue(getExtendedDataValue(product, "Tag")),
      domains: parseListValue(getExtendedDataValue(product, "Domain"), [
        "Colorless",
      ]),
      productDetails:
        stripHtml(getExtendedDataValue(product, "Description")) || "-",
      imageUrl: product.imageUrl,
      sourceUrl: product.url,
      artist: null,
      hasErrata: false,
      marketPrice: prices.marketPrice,
      marketPriceUpdatedAt: prices.marketPriceUpdatedAt,
      marketPriceCurrency: "USD",
      marketPrices: prices.marketPrices,
      finishOptions: prices.finishOptions,
      defaultFinish: prices.defaultFinish,
    };
    cards.push(card);
  }
  return cards;
}
export function validateRiftboundCatalog(catalog) {
  const ids = new Set();
  const sourceProductIds = new Set();
  for (const card of catalog) {
    if (ids.has(card.id))
      throw new Error(`Duplicate Riftbound catalogue card ID ${card.id}.`);
    ids.add(card.id);
    if (card.sourceProductId !== undefined) {
      if (sourceProductIds.has(card.sourceProductId))
        throw new Error(
          `Duplicate Riftbound promo source product ${card.sourceProductId} in catalogue.`,
        );
      sourceProductIds.add(card.sourceProductId);
    }
    if (!Array.isArray(card.finishOptions) || card.finishOptions.length === 0)
      throw new Error(`Riftbound card ${card.id} has no finish options.`);
  }
}
