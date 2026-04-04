# Tiki E-Commerce API Crawler

A Node.js crawler that fetches product data from Tiki.vn using their public API. Exports data in both JSON and CSV formats, organized by category.

## Features

- API-based crawling (no browser automation required)
- Normalized database structure (4 tables: category, store, product, review)
- Exports to Supabase PostgreSQL database
- Exports to JSON and CSV files organized by category
- Configurable rate limiting
- Crawls 5 tech/electronics categories

## Database Schema

### category
- category_id (PK)
- category_name
- parent_category

### store
- store_id (PK)
- store_name
- store_rating
- follower_count

### product
- product_id (PK)
- store_id (FK)
- category_id (FK)
- product_name
- product_url
- brand
- description
- price
- original_price
- discount_percent
- sold_count
- rating_avg
- review_count

### review
- review_id (PK)
- product_id (FK)
- user_name
- rating
- review_text
- like_count
- review_date

## Installation

```bash
cd /path/to/project
npm install
```

## Configuration

You only need to configure the category IDs you want to crawl. The crawler will fetch all subcategories and products under those categories.

### Find Category IDs
Use Tiki's API to find category IDs for the categories you want to crawl. Update `src/tiki-api-crawler.js` with the correct category IDs.

The process involves:
1. Open Tiki.vn in your browser
2. Open Developer Tools (F12)
3. Go to the Network tab
4. Click on a category (e.g., "Điện thoại - Máy tính bảng")
5. Using filters/search in Network tab, and search `category=`. You will find API calls like `https://tiki.vn/api/personalish/v1/blocks/listings?limit=10&sort=top_seller&page=1&urlKey=dien-thoai-may-tinh-bang&category=1789` where `1789` is the category ID, and `dien-thoai-may-tinh-bang` is the URL key. You can use these to configure the crawler.

Note: Tiki's category structure is hierarchical. You may need to go into subcategories to find more products and reviews, as the API limits to 50 pages per category.

### Adjust Crawler Settings (Optional)

Edit `src/tiki-api-crawler.js`:

```javascript
const DELAY_BETWEEN_REQUESTS = 500; // milliseconds between API calls
const MAX_PAGES_PER_CATEGORY = 25;  // pages per category (40 products per page)
const MAX_REVIEWS_PER_REQUEST = 10; // Tiki may limit this
const MAX_REVIEWS_PER_PRODUCT = 20; // reviews to fetch per product
```

## Usage

Run the crawler:

```bash
npm run crawl:api
```

The crawler will:
1. Fetch products from all configured categories
2. Get detailed product information
3. Fetch reviews for each product
4. Transform data to match database schema
5. Save to Supabase database
6. Export to JSON and CSV files

## Output Structure

Data is organized by category in the `output/` directory:

```
├── output/
│   ├── api_product_details.csv
│   ├── api_product_details.json
│   ├── api_reviews_data.csv
│   ├── api_reviews_data.json
│   ├── categories.json
│   ├── categories.csv
│   ├── stores.json
│   ├── stores.csv
│   ├── products.json
│   ├── products.csv
│   ├── reviews.json
│   └── reviews.csv
```

Each category folder contains:
- `categories.json` and `categories.csv` - Category information
- `stores.json` and `stores.csv` - Store/seller information
- `products.json` and `products.csv` - Product details
- `reviews.json` and `reviews.csv` - Product reviews
- `api_product_details.json` and `api_product_details.csv` - Raw product details from API
- `api_reviews_data.json` and `api_reviews_data.csv` - Raw reviews data from API

## Categories Crawled

1. Dien thoai - May tinh bang (Phones and Tablets)
2. Thiet bi so - Phu kien so (Electronics and Accessories)
3. Laptop - May vi tinh - Linh kien (Laptops and Components)
4. Dien gia dung (Home Appliances)
5. Dien tu - Dien lanh (Electronics and Cooling)

## Troubleshooting

### "Rate limit exceeded"
- Increase `DELAY_BETWEEN_REQUESTS` value
- Reduce `MAX_PAGES_PER_CATEGORY`
- Wait and retry later

### No reviews fetched
- Some products have no reviews
- Tiki API may limit review access
- Check `MAX_REVIEWS_PER_PRODUCT` setting

## Estimated Crawl Times

| Products per Category | Total Products | Estimated Time |
|----------------------|----------------|----------------|
| 40 (1 page) | 200 | 3-5 minutes |
| 400 (10 pages) | 2,000 | 30-45 minutes |
| 1000 (25 pages) | 5,000 | 1.5-2 hours |

Times vary based on `DELAY_BETWEEN_REQUESTS` and network speed.

## Notes

- Uses Tiki's public API endpoints
- Respect rate limits and robots.txt
- Run periodically to update data
- Clean `output/` folder manually if needed
- Crawling 5000 products takes approximately 1.5-2 hours
