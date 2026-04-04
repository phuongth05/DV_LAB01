/**
 * Tiki API Crawler
 * Crawls product data from Tiki using their public API endpoints
 * Exports both JSON and CSV files organized by category
 */
import fs from 'fs';
import path from 'path';

// ============================================================
// CONFIGURATION
// ============================================================
// Rate limiting settings
const DELAY_BETWEEN_REQUESTS = 1000; // ms between API calls
const MAX_PAGES_PER_CATEGORY = 50; // Tiki API have max 50 pages.
const MAX_REVIEWS_PER_REQUEST = 20; // this is the maximum we can get in one request
const MAX_REVIEWS_PER_PRODUCT = 1000;
// Category configurations
// Because Tiki's API have max 50 pages for each category
// we need to go deeper into subcategories to get more products and reviews
const CATEGORIES = [
    // {
    //     id: 8095,
    //     name: 'Laptop',
    //     urlKey: 'laptop',
    // },
    // {
    //     id: 1789,
    //     name: 'Dien thoai - May tinh bang',
    //     urlKey: 'dien-thoai-may-tinh-bang',
    // },
    // {
    //     id: 1815,
    //     name: 'Thiet bi so - Phu kien so',
    //     urlKey: 'thiet-bi-kts-phu-kien-so',
    // },
    // {    
    //     id: 1846,
    //     name: 'Laptop - May vi tinh - Linh kien',
    //     urlKey: 'laptop-may-vi-tinh-linh-kien',
    // },
    // {
    //     id: 1882,
    //     name: 'Dien gia dung',
    //     urlKey: 'dien-gia-dung',
    // },
    // {
    //     id: 4221,
    //     name: ' Dien tu - Dien lanh',
    //     urlKey: 'dien-tu-dien-lanh',
    // },
];


// API headers to mimic browser requests
const API_HEADERS = {
    'User-Agent': 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/120.0.0.0 Safari/537.36',
    'Accept': 'application/json, text/plain, */*',
    'Accept-Language': 'vi-VN,vi;q=0.9,en-US;q=0.8,en;q=0.7',
    'Referer': 'https://tiki.vn/',
    'Origin': 'https://tiki.vn',
};

// ============================================================
// UTILITY FUNCTIONS
// ============================================================

function sleep(ms) {
    return new Promise(resolve => setTimeout(resolve, ms));
}

function generateTrackityId() {
    const chars = '0123456789abcdef';
    const segments = [8, 4, 4, 4, 12];
    return segments.map(len =>
        Array.from({length: len}, () => chars[Math.floor(Math.random() * chars.length)]).join('')
    ).join('-');
}

/**
 * Convert JSON array to CSV string
 */
function jsonToCSV(data) {
    if (!data || data.length === 0) return '';

    // Get all unique keys from all objects
    const keys = [...new Set(data.flatMap(obj => Object.keys(obj)))];

    // Create header
    const header = keys.join(',');

    // Create rows
    const rows = data.map(obj => {
        return keys.map(key => {
            let value = obj[key];

            // Handle null/undefined
            if (value === null || value === undefined) {
                return '';
            }

            // Handle objects/arrays - stringify them
            if (typeof value === 'object') {
                value = JSON.stringify(value).replace(/"/g, '""');
            }

            // Convert to string and escape
            value = String(value).replace(/"/g, '""');

            // Quote if contains comma, newline, or quote
            if (value.includes(',') || value.includes('\n') || value.includes('"')) {
                return `"${value}"`;
            }

            return value;
        }).join(',');
    });

    return [header, ...rows].join('\n');
}

// ============================================================
// API FUNCTIONS
// ============================================================

async function fetchCategoryProducts(category, page = 1, stats = null) {
    const trackityId = generateTrackityId();
    const url = `https://tiki.vn/api/personalish/v1/blocks/listings?limit=40&include=advertisement&aggregations=2&version=home-persionalized&trackity_id=${trackityId}&category=${category.id}&page=${page}&urlKey=${category.urlKey}`;

    if (stats) stats.apiRequests.total++;

    try {
        const response = await fetch(url, { headers: API_HEADERS });
        if (!response.ok) {
            console.error(`Failed to fetch category ${category.name} page ${page}: ${response.status}`);
            if (stats) stats.apiRequests.failed++;
            return { data: [], paging: { last_page: page } };
        }
        if (stats) stats.apiRequests.successful++;
        return await response.json();
    } catch (error) {
        console.error(`Error fetching category ${category.name} page ${page}:`, error.message);
        if (stats) stats.apiRequests.failed++;
        return { data: [], paging: { last_page: page } };
    }
}

async function fetchProductDetails(productId, spid, stats = null) {
    const url = `https://tiki.vn/api/v2/products/${productId}?platform=web&spid=${spid || productId}&version=3`;

    if (stats) stats.apiRequests.total++;

    try {
        const response = await fetch(url, { headers: API_HEADERS });
        if (!response.ok) {
            console.error(`Failed to fetch product ${productId}: ${response.status}`);
            if (stats) stats.apiRequests.failed++;
            return null;
        }
        if (stats) stats.apiRequests.successful++;
        return await response.json();
    } catch (error) {
        console.error(`Error fetching product ${productId}:`, error.message);
        if (stats) stats.apiRequests.failed++;
        return null;
    }
}

async function fetchProductReviews(productId, spid, sellerId, page, limit = MAX_REVIEWS_PER_PRODUCT, stats = null) {
    const url = `https://tiki.vn/api/v2/reviews?limit=${limit}&include=comments,contribute_info,attribute_vote_summary&sort=score|desc,id|desc,stars|all&page=${page}&spid=${spid || productId}&product_id=${productId}&seller_id=${sellerId || 1}`;

    if (stats) stats.apiRequests.total++;

    try {
        const response = await fetch(url, { headers: API_HEADERS });
        if (!response.ok) {
            if (stats) stats.apiRequests.failed++;
            return { data: [], stars: {} };
        }
        if (stats) stats.apiRequests.successful++;
        return await response.json();
    } catch (error) {
        console.error(`Error fetching reviews for product ${productId}:`, error.message);
        if (stats) stats.apiRequests.failed++;
        return { data: [], stars: {} };
    }
}

async function fetchSellerDetails(sellerId, stats = null) {
    const url = `https://tiki.vn/api/shopping/v2/widgets/seller?seller_id=${sellerId}`;

    if (stats) stats.apiRequests.total++;

    try {
        const response = await fetch(url, { headers: API_HEADERS });
        if (!response.ok) {
            if (stats) stats.apiRequests.failed++;
            return null;
        }
        if (stats) stats.apiRequests.successful++;
        return await response.json();
    } catch (error) {
        console.error(`Error fetching seller details for seller ${sellerId}:`, error.message);
        if (stats) stats.apiRequests.failed++;
        return null;
    }
}

async function fetchSubcategories(parentId, stats = null) {
    const url = `https://tiki.vn/api/v2/categories?include=children&parent_id=${parentId}`;

    if (stats) stats.apiRequests.total++;

    try {
        const response = await fetch(url, { headers: API_HEADERS });
        if (!response.ok) {
            console.error(`Failed to fetch subcategories for parent ${parentId}: ${response.status}`);
            if (stats) stats.apiRequests.failed++;
            return [];
        }
        if (stats) stats.apiRequests.successful++;
        const result = await response.json();
        return result.data || [];
    } catch (error) {
        console.error(`Error fetching subcategories for parent ${parentId}:`, error.message);
        if (stats) stats.apiRequests.failed++;
        return [];
    }
}

// ============================================================
// DATA TRANSFORMATION TO MATCH SCHEMA
// ============================================================

/**
 * Extract all categories from breadcrumbs to get full hierarchy
 */
function extractCategoriesFromBreadcrumbs(breadcrumbs) {
    if (!breadcrumbs || !Array.isArray(breadcrumbs)) {
        return [];
    }

    const categories = [];
    for (let i = 0; i < breadcrumbs.length; i++) {
        const crumb = breadcrumbs[i];
        // Skip the last item if it's the product itself (has category_id 0 or no category_id)
        if (!crumb.category_id || crumb.category_id === 0) {
            continue;
        }

        const parentName = i > 0 ? breadcrumbs[i - 1].name : null;

        categories.push({
            category_id: crumb.category_id,
            category_name: crumb.name,
            parent_category: parentName
        });
    }

    return categories;
}

function transformCategory(categoryConfig) {
    return {
        category_id: categoryConfig.id,
        category_name: categoryConfig.name,
        parent_category: categoryConfig.parent || null
    };
}

function transformStore(productDetail, sellerDetailsData = null) {
    if (!productDetail.current_seller) return null;

    const seller = productDetail.current_seller;
    const sellerInfo = sellerDetailsData?.data?.seller;

    // Extract follower count and rating from seller details API if available
    const followerCount = sellerInfo?.total_follower || seller.follower_count || 0;
    const storeRating = sellerInfo?.avg_rating_point || seller.store_rating || 0;

    return {
        store_id: seller.id,
        store_name: seller.name || '',
        store_rating: storeRating,
        follower_count: followerCount
    };
}

function transformProduct(productDetail, categoryId, actualReviewCount) {
    if (!productDetail) return null;

    const originalPrice = productDetail.original_price || productDetail.list_price || productDetail.price;
    const price = productDetail.price || 0;
    let discountPercent = 0;
    if (originalPrice > price && price > 0) {
        discountPercent = Math.round(((originalPrice - price) / originalPrice) * 100);
    }
    if (productDetail.discount_rate) {
        discountPercent = productDetail.discount_rate;
    }

    const productUrl = `https://tiki.vn/${productDetail.url_key || ''}-p${productDetail.id}.html`;

    let description = productDetail.description || '';
    if (productDetail.short_description) {
        description = productDetail.short_description;
    }

    return {
        product_id: productDetail.id,
        store_id: productDetail.current_seller?.id || null,
        category_id: categoryId,
        product_name: productDetail.name || '',
        product_url: productUrl,
        brand: productDetail.brand?.name || productDetail.brand_name || '',
        description: description,
        price: price,
        original_price: originalPrice,
        discount_percent: discountPercent,
        sold_count: productDetail.quantity_sold?.value || productDetail.all_time_quantity_sold || 0,
        rating_avg: productDetail.rating_average || 0,
        review_count: actualReviewCount || productDetail.review_count || 0
    };
}

function transformReviews(reviewsData, productId) {
    if (!reviewsData || !reviewsData.data || !Array.isArray(reviewsData.data)) {
        return [];
    }

    return reviewsData.data.map(review => ({
        review_id: review.id || `${productId}_${Date.now()}_${Math.random()}`,
        product_id: productId,
        user_name: review.created_by?.name || review.customer_name || 'Anonymous',
        rating: review.rating || 0,
        review_text: review.content || review.title || '',
        like_count: review.thank_count || 0,
        review_date: review.created_at ? new Date(review.created_at * 1000).toISOString() : null
    }));
}

// ============================================================
// MAIN CRAWLER
// ============================================================

/**
 * Recursively traverse category tree and scrape products only at leaf categories
 */
async function traverseAndCrawlCategory(category, allCategories, allStores, allProducts, allReviews,
                                       sellerDetailsCache, originalApiData, dataByOriginalCategory,
                                       originalCategoryUrlKey, stats, depth = 0) {
    const indent = '  '.repeat(depth);

    console.log(`${indent}Checking category: ${category.name} (ID: ${category.id})`);

    // Add current category to allCategories with parent info
    if (!allCategories.has(category.id)) {
        const categoryData = transformCategory(category);
        allCategories.set(category.id, categoryData);
    }

    // Fetch subcategories
    await sleep(DELAY_BETWEEN_REQUESTS / 2);
    const subcategories = await fetchSubcategories(category.id, stats);

    // Check if there are any actual subcategories
    const hasSubcategories = subcategories && subcategories.length > 0;

    if (hasSubcategories) {
        console.log(`${indent}  → Found ${subcategories.length} subcategories, going deeper...`);

        // Recursively traverse subcategories
        for (const subcat of subcategories) {
            await traverseAndCrawlCategory(
                { id: subcat.id, name: subcat.name, urlKey: subcat.url_key, parent: category.name },
                allCategories, allStores, allProducts, allReviews,
                sellerDetailsCache, originalApiData, dataByOriginalCategory,
                originalCategoryUrlKey, stats, depth + 1
            );
        }
    } else {
        // This is a leaf category, scrape products
        console.log(`${indent}  → Leaf category detected, scraping products...`);

        await crawlCategoryProducts(
            category, allCategories, allStores, allProducts, allReviews,
            sellerDetailsCache, originalApiData, dataByOriginalCategory,
            originalCategoryUrlKey, stats, depth
        );
    }
}

/**
 * Scrape products from a single category (leaf node)
 */
async function crawlCategoryProducts(category, allCategories, allStores, allProducts, allReviews,
                                    sellerDetailsCache, originalApiData, dataByOriginalCategory,
                                    originalCategoryUrlKey, stats, depth = 0) {
    const indent = '  '.repeat(depth);
    const categoryStartTime = Date.now();

    // Add category to allCategories if not exists
    if (!allCategories.has(category.id)) {
        const categoryData = transformCategory(category);
        allCategories.set(category.id, categoryData);
    }

    // Track stats for this specific leaf category
    if (!stats.leafCategories) {
        stats.leafCategories = {};
    }
    stats.leafCategories[category.urlKey] = {
        name: category.name,
        startTime: categoryStartTime,
        productsProcessed: 0,
        productsSkipped: 0
    };

    let page = 1;
    let hasMorePages = true;
    let productsFound = 0;

    while (hasMorePages && page <= MAX_PAGES_PER_CATEGORY) {
        console.log(`${indent}    Page ${page}...`);

        const listingData = await fetchCategoryProducts(category, page, stats);

        if (!listingData.data || listingData.data.length === 0) {
            console.log(`${indent}    No more products on page ${page}`);
            break;
        }

        console.log(`${indent}    Found ${listingData.data.length} products on page ${page}`);

        for (const productListItem of listingData.data) {
            try {
                await sleep(DELAY_BETWEEN_REQUESTS);

                if (!productListItem.id || productListItem.type === 'advertisement') {
                    stats.leafCategories[category.urlKey].productsSkipped++;
                    continue;
                }

                const productId = productListItem.id;
                const spid = productListItem.seller_product_id || productListItem.id;
                const sellerId = productListItem.seller_id || productListItem.current_seller?.id;

                const productDetail = await fetchProductDetails(productId, spid, stats);
                if (!productDetail) {
                    stats.leafCategories[category.urlKey].productsSkipped++;
                    continue;
                }

                await sleep(DELAY_BETWEEN_REQUESTS / 2);

                // Fetch reviews until we reach the maximum limit or there are no more reviews
                let cntReviews = 0;
                let pageReviews = 1;
                let reviewsData = { data: [], stars: {} };
                while (cntReviews < MAX_REVIEWS_PER_PRODUCT) {
                    const reviewsToFetch = Math.min(MAX_REVIEWS_PER_REQUEST, MAX_REVIEWS_PER_PRODUCT - cntReviews);
                    const reviewsResponse = await fetchProductReviews(productId, spid, sellerId, pageReviews, reviewsToFetch, stats);
                    if (!reviewsResponse || !reviewsResponse.data || reviewsResponse.data.length === 0) {
                        break;
                    }
                    reviewsData.data.push(...reviewsResponse.data);
                    cntReviews += reviewsResponse.data.length;
                    pageReviews++;
                }

                // Store original API responses
                originalApiData.productDetails.push(productDetail);
                originalApiData.reviewsData.push({
                    product_id: productId,
                    ...reviewsData
                });

                // Extract categories from breadcrumbs to get full hierarchy
                if (productDetail.breadcrumbs && Array.isArray(productDetail.breadcrumbs)) {
                    const breadcrumbCategories = extractCategoriesFromBreadcrumbs(productDetail.breadcrumbs);
                    breadcrumbCategories.forEach(cat => {
                        if (!allCategories.has(cat.category_id)) {
                            allCategories.set(cat.category_id, cat);
                        }
                    });
                }

                // Fetch seller details if we haven't already
                let sellerDetails = null;
                if (productDetail.current_seller?.id) {
                    const sellerId = productDetail.current_seller.id;
                    if (!sellerDetailsCache.has(sellerId)) {
                        await sleep(DELAY_BETWEEN_REQUESTS / 2);
                        sellerDetails = await fetchSellerDetails(sellerId, stats);
                        sellerDetailsCache.set(sellerId, sellerDetails);
                    } else {
                        sellerDetails = sellerDetailsCache.get(sellerId);
                    }
                }

                // Transform data
                const storeData = transformStore(productDetail, sellerDetails);
                if (storeData) {
                    if (!allStores.has(storeData.store_id)) {
                        allStores.set(storeData.store_id, storeData);
                    }
                    if (!dataByOriginalCategory[originalCategoryUrlKey].stores.has(storeData.store_id)) {
                        dataByOriginalCategory[originalCategoryUrlKey].stores.set(storeData.store_id, storeData);
                    }
                }

                // Get actual review count from reviews API response
                const actualReviewCount = reviewsData.reviews_count || reviewsData.paging?.total || productDetail.review_count || 0;

                const productData = transformProduct(productDetail, category.id, actualReviewCount);
                if (productData) {
                    allProducts.push(productData);
                    dataByOriginalCategory[originalCategoryUrlKey].products.push(productData);
                }

                const reviewList = transformReviews(reviewsData, productId);
                allReviews.push(...reviewList);
                dataByOriginalCategory[originalCategoryUrlKey].reviews.push(...reviewList);

                productsFound++;
                stats.leafCategories[category.urlKey].productsProcessed++;

                if (productsFound % 10 === 0) {
                    console.log(`${indent}    Progress: ${productsFound} products found in this leaf category`);
                }

            } catch (error) {
                console.error(`${indent}    Error processing product ${productListItem.id}:`, error.message);
                stats.leafCategories[category.urlKey].productsSkipped++;
            }
        }

        const paging = listingData.paging;
        hasMorePages = paging && page < (paging.last_page || MAX_PAGES_PER_CATEGORY);
        page++;

        await sleep(DELAY_BETWEEN_REQUESTS);
    }

    // Finalize stats
    const categoryEndTime = Date.now();
    stats.leafCategories[category.urlKey].endTime = categoryEndTime;
    stats.leafCategories[category.urlKey].durationMs = categoryEndTime - categoryStartTime;
    stats.leafCategories[category.urlKey].durationSec = ((categoryEndTime - categoryStartTime) / 1000).toFixed(2);

    console.log(`${indent}  ✓ Leaf category ${category.name}: ${productsFound} products scraped`);
}

async function crawlTikiProducts() {
    const startTime = Date.now();

    console.log('='.repeat(70));
    console.log('Tiki API Crawler - Starting');
    console.log('='.repeat(70));
    console.log(`Categories to crawl: ${CATEGORIES.length}`);
    console.log(`Max pages per category: ${MAX_PAGES_PER_CATEGORY}`);
    console.log(`Max reviews per product: ${MAX_REVIEWS_PER_PRODUCT}`);
    console.log(`Delay between requests: ${DELAY_BETWEEN_REQUESTS}ms`);
    console.log('='.repeat(70));

    const allCategories = new Map();
    const allStores = new Map();
    const allProducts = [];
    const allReviews = [];

    // Cache for seller details to avoid duplicate API calls
    const sellerDetailsCache = new Map();

    // Store original API responses for reference
    const originalApiData = {
        productDetails: [],
        reviewsData: []
    };

    // Store data by category for organized export
    const dataByCategory = {};

    // Statistics tracking
    const stats = {
        startTime: startTime,
        apiRequests: {
            total: 0,
            successful: 0,
            failed: 0
        },
        categories: {},
        leafCategories: {},
        memoryStart: process.memoryUsage()
    };

    // Add all categories first
    CATEGORIES.forEach(cat => {
        const categoryData = transformCategory(cat);
        allCategories.set(categoryData.category_id, categoryData);

        // Initialize category data storage
        dataByCategory[cat.urlKey] = {
            category: categoryData,
            stores: new Map(),
            products: [],
            reviews: []
        };
    });

    // Crawl each category
    for (const category of CATEGORIES) {
        const categoryStartTime = Date.now();

        console.log(`\n${'='.repeat(70)}`);
        console.log(`Starting recursive crawl of category: ${category.name} (ID: ${category.id})`);
        console.log(`${'='.repeat(70)}`);

        // Initialize category stats
        stats.categories[category.urlKey] = {
            name: category.name,
            startTime: categoryStartTime
        };

        // Recursively traverse and crawl
        await traverseAndCrawlCategory(
            category,
            allCategories,
            allStores,
            allProducts,
            allReviews,
            sellerDetailsCache,
            originalApiData,
            dataByCategory,
            category.urlKey,
            stats
        );

        // Finalize category stats
        const categoryEndTime = Date.now();
        stats.categories[category.urlKey].endTime = categoryEndTime;
        stats.categories[category.urlKey].durationMs = categoryEndTime - categoryStartTime;
        stats.categories[category.urlKey].durationSec = ((categoryEndTime - categoryStartTime) / 1000).toFixed(2);

        const catStats = stats.categories[category.urlKey];
        console.log(`\n${'='.repeat(70)}`);
        console.log(`Category ${category.name} complete: ${dataByCategory[category.urlKey].products.length} total products crawled in ${catStats.durationSec}s`);
        console.log(`${'='.repeat(70)}`);
    }

    const endTime = Date.now();
    const totalDurationSec = ((endTime - startTime) / 1000).toFixed(2);
    const totalDurationMin = ((endTime - startTime) / 60000).toFixed(2);
    const memoryEnd = process.memoryUsage();

    // Calculate total skipped from leaf categories
    const totalSkipped = stats.leafCategories ?
        Object.values(stats.leafCategories).reduce((sum, cat) => sum + (cat.productsSkipped || 0), 0) : 0;

    // Finalize stats
    stats.endTime = endTime;
    stats.totalDurationMs = endTime - startTime;
    stats.totalDurationSec = totalDurationSec;
    stats.totalDurationMin = totalDurationMin;
    stats.memoryEnd = memoryEnd;
    stats.successRate = stats.apiRequests.total > 0
        ? ((stats.apiRequests.successful / stats.apiRequests.total) * 100).toFixed(2)
        : 0;
    stats.productsPerSecond = (allProducts.length / (endTime - startTime) * 1000).toFixed(2);
    stats.requestsPerSecond = (stats.apiRequests.total / (endTime - startTime) * 1000).toFixed(2);

    console.log('\n' + '='.repeat(70));
    console.log('Crawling completed');
    console.log('='.repeat(70));
    console.log('Data Summary:');
    console.log(`  Categories: ${allCategories.size}`);
    console.log(`  Stores: ${allStores.size}`);
    console.log(`  Products: ${allProducts.length}`);
    console.log(`  Reviews: ${allReviews.length}`);
    console.log(`  Skipped: ${totalSkipped}`);
    console.log(`  Leaf categories scraped: ${Object.keys(stats.leafCategories || {}).length}`);
    console.log('\nPerformance Statistics:');
    console.log(`  Total Duration: ${totalDurationSec}s (${totalDurationMin} min)`);
    console.log(`  API Requests: ${stats.apiRequests.total} (Success: ${stats.apiRequests.successful}, Failed: ${stats.apiRequests.failed})`);
    console.log(`  Success Rate: ${stats.successRate}%`);
    console.log(`  Products/sec: ${stats.productsPerSecond}`);
    console.log(`  Requests/sec: ${stats.requestsPerSecond}`);
    console.log('\nMemory Usage:');
    console.log(`  Start: ${(stats.memoryStart.heapUsed / 1024 / 1024).toFixed(2)} MB`);
    console.log(`  End: ${(memoryEnd.heapUsed / 1024 / 1024).toFixed(2)} MB`);
    console.log('='.repeat(70));

    return {
        categories: Array.from(allCategories.values()),
        stores: Array.from(allStores.values()),
        products: allProducts,
        reviews: allReviews,
        byCategory: dataByCategory,
        originalApiData: originalApiData,
        statistics: stats
    };
}

// ============================================================
// SAVE DATA TO FILES (JSON + CSV)
// ============================================================

async function saveToFiles(data) {
    const outputDir = './output';
    const timestamp = new Date().toISOString().replace(/[:.]/g, '-').split('T')[0];

    if (!fs.existsSync(outputDir)) {
        fs.mkdirSync(outputDir, { recursive: true });
    }

    console.log('\n' + '='.repeat(70));
    console.log('Saving to files (JSON + CSV)...');
    console.log('='.repeat(70));

    // Save combined data (transformed/normalized data matching database schema)
    console.log('\nSaving combined transformed data...');

    // Save JSON files
    fs.writeFileSync(
        path.join(outputDir, 'categories.json'),
        JSON.stringify(data.categories, null, 2),
        'utf-8'
    );
    console.log(`  ✓ categories.json: ${data.categories.length} categories`);

    fs.writeFileSync(
        path.join(outputDir, 'stores.json'),
        JSON.stringify(data.stores, null, 2),
        'utf-8'
    );
    console.log(`  ✓ stores.json: ${data.stores.length} stores`);

    fs.writeFileSync(
        path.join(outputDir, 'products.json'),
        JSON.stringify(data.products, null, 2),
        'utf-8'
    );
    console.log(`  ✓ products.json: ${data.products.length} products`);

    fs.writeFileSync(
        path.join(outputDir, 'reviews.json'),
        JSON.stringify(data.reviews, null, 2),
        'utf-8'
    );
    console.log(`  ✓ reviews.json: ${data.reviews.length} reviews`);

    // Save CSV files (transformed/normalized data)
    fs.writeFileSync(
        path.join(outputDir, 'categories.csv'),
        jsonToCSV(data.categories),
        'utf-8'
    );
    console.log(`  ✓ categories.csv: ${data.categories.length} categories`);

    fs.writeFileSync(
        path.join(outputDir, 'stores.csv'),
        jsonToCSV(data.stores),
        'utf-8'
    );
    console.log(`  ✓ stores.csv: ${data.stores.length} stores`);

    fs.writeFileSync(
        path.join(outputDir, 'products.csv'),
        jsonToCSV(data.products),
        'utf-8'
    );
    console.log(`  ✓ products.csv: ${data.products.length} products`);

    fs.writeFileSync(
        path.join(outputDir, 'reviews.csv'),
        jsonToCSV(data.reviews),
        'utf-8'
    );
    console.log(`  ✓ reviews.csv: ${data.reviews.length} reviews`);

    // Save original API responses (raw data from Tiki API)
    console.log('\nSaving original API responses...');

    fs.writeFileSync(
        path.join(outputDir, 'api_product_details.json'),
        JSON.stringify(data.originalApiData.productDetails, null, 2),
        'utf-8'
    );
    console.log(`  ✓ api_product_details.json: ${data.originalApiData.productDetails.length} products (raw API data)`);

    fs.writeFileSync(
        path.join(outputDir, 'api_reviews_data.json'),
        JSON.stringify(data.originalApiData.reviewsData, null, 2),
        'utf-8'
    );
    console.log(`  ✓ api_reviews_data.json: ${data.originalApiData.reviewsData.length} review responses (raw API data)`);

    // Save original API responses as CSV
    fs.writeFileSync(
        path.join(outputDir, 'api_product_details.csv'),
        jsonToCSV(data.originalApiData.productDetails),
        'utf-8'
    );
    console.log(`  ✓ api_product_details.csv: ${data.originalApiData.productDetails.length} products (raw API data)`);

    fs.writeFileSync(
        path.join(outputDir, 'api_reviews_data.csv'),
        jsonToCSV(data.originalApiData.reviewsData),
        'utf-8'
    );
    console.log(`  ✓ api_reviews_data.csv: ${data.originalApiData.reviewsData.length} review responses (raw API data)`);

    // Save combined summary
    const summary = {
        crawl_date: new Date().toISOString(),
        total_categories: data.categories.length,
        total_stores: data.stores.length,
        total_products: data.products.length,
        total_reviews: data.reviews.length,
        performance: {
            total_duration_sec: data.statistics.totalDurationSec,
            total_duration_min: data.statistics.totalDurationMin,
            api_requests: data.statistics.apiRequests,
            success_rate_percent: data.statistics.successRate,
            products_per_second: data.statistics.productsPerSecond,
            requests_per_second: data.statistics.requestsPerSecond
        },
        memory_usage: {
            start_mb: (data.statistics.memoryStart.heapUsed / 1024 / 1024).toFixed(2),
            end_mb: (data.statistics.memoryEnd.heapUsed / 1024 / 1024).toFixed(2)
        },
        categories: CATEGORIES.map(c => ({
            name: c.name,
            products: data.byCategory[c.urlKey].products.length,
            stores: data.byCategory[c.urlKey].stores.size,
            reviews: data.byCategory[c.urlKey].reviews.length,
            duration_sec: data.statistics.categories[c.urlKey]?.durationSec || 0
        }))
    };

    fs.writeFileSync(
        path.join(outputDir, `summary_${timestamp}.json`),
        JSON.stringify(summary, null, 2),
        'utf-8'
    );

    console.log(`\n✓ Summary saved to: ${outputDir}/summary_${timestamp}.json`);
    console.log('\n' + '='.repeat(70));
    console.log('File Save Summary:');
    console.log('='.repeat(70));
    console.log('Transformed/Normalized Data (matching database schema):');
    console.log(`  - categories.json/csv: ${data.categories.length} categories with full hierarchy`);
    console.log(`  - stores.json/csv: ${data.stores.length} stores`);
    console.log(`  - products.json/csv: ${data.products.length} products`);
    console.log(`  - reviews.json/csv: ${data.reviews.length} reviews`);
    console.log('\nOriginal API Responses (raw data from Tiki):');
    console.log(`  - api_product_details.json/csv: ${data.originalApiData.productDetails.length} products`);
    console.log(`  - api_reviews_data.json/csv: ${data.originalApiData.reviewsData.length} review responses`);
    console.log('='.repeat(70));
}

// ============================================================
// MAIN
// ============================================================

async function main() {
    try {
        const data = await crawlTikiProducts();

        if (data.products.length === 0) {
            console.log('\nNo products crawled. Exiting.');
            return;
        }

        await saveToFiles(data);

        console.log('\n' + '='.repeat(70));
        console.log('All done');
        console.log('='.repeat(70));

    } catch (error) {
        console.error('\nFatal error:', error);
        process.exit(1);
    }
}

main();
