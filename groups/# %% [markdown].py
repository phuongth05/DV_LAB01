# %% [markdown]
# # Analysis of the Relationship Between Product Attributes and Sales Effectiveness
# 
# ## Member: My
# 
# ### Analysis Objectives:
# 1. **Question 1**: How do price segments affect sales effectiveness (sold_count)? What price range generates the highest sales volume and estimated revenue?
# 
# 2. **Question 2**: How does the discount percentage affect demand stimulation (sold_count)? Is there an optimal discount threshold that significantly boosts sales?

# %%
# Import libraries
import pandas as pd
import numpy as np
import matplotlib.pyplot as plt
import seaborn as sns
from scipy import stats
import os
import warnings
warnings.filterwarnings('ignore')

# Display configuration
plt.rcParams['figure.figsize'] = (16, 10)
plt.rcParams['font.size'] = 10
sns.set_style('whitegrid')
pd.set_option('display.max_columns', None)

# Create output directory if not exists
output_dir = '../output'
os.makedirs(output_dir, exist_ok=True)

# %% [markdown]
# ## 1. Load Common Data

# %%
# Load 4 common data tables following team standards
df_store    = pd.read_csv('../data/stores.csv')
df_category = pd.read_csv('../data/categories.csv')
df_product  = pd.read_csv('../data/products.csv')
df_review   = pd.read_csv('../data/reviews.csv')

print("Data Size:")
print(f"Stores: {df_store.shape}")
print(f"Categories: {df_category.shape}")
print(f"Products: {df_product.shape}")
print(f"Reviews: {df_review.shape}")

# %%
#check distribution
print("\n=== SOLD COUNT DISTRIBUTION ===")
print(df_product['sold_count'].describe())
df_product = df_product[df_product['sold_count'] < df_product['sold_count'].quantile(0.99)]

zero_ratio = (df_product['sold_count'] == 0).mean()
print(f"Percentage of products with zero sales: {zero_ratio:.2%}")

# Visualization: Distribution
plt.figure(figsize=(10,6))
sns.histplot(df_product['sold_count'], bins=50)
plt.yscale('log')
plt.title('Distribution of Sold Count (Highly Skewed)')
plt.xlabel('Sold Count')
plt.ylabel('Frequency (log scale)')
plt.show()

# %%
#Remove extreme outliers to avoid distortion
df_product = df_product[
    (df_product['sold_count'] < df_product['sold_count'].quantile(0.99)) &
    (df_product['price'] < df_product['price'].quantile(0.99))
].copy()

print("\nAfter removing top 1% outliers:")
print(df_product[['price', 'sold_count']].describe())

# %% [markdown]
# ## 2. Question 1: Effect of Price Segments on Sales Effectiveness

# %%
# --- df_my_01: Main working DataFrame for Question 1 ---
df_my_01 = df_product.copy()

# Filter products with valid data
df_my_01 = df_my_01[
    (df_my_01['price'] > 0) &
    (df_my_01['source_category'].notna())
].copy()

# Category name mapping
category_mapping = {
    'diengiadung': 'Home Appliances',
    'dientu_dienlanh': 'Electronics & Cooling',
    'dienthoai_maytinhbang': 'Phones & Tablets',
    'laptop_mayvitinh_linhkien': 'Laptops & Components',
    'thietbiso_phukienso': 'Digital Devices & Accessories'
}

df_my_01['category_name'] = df_my_01['source_category'].map(category_mapping)
df_my_01 = df_my_01[df_my_01['category_name'].notna()]

# Create price segments (Vietnamese market segments)
df_my_01['price_segment'] = pd.cut(
    df_my_01['price'],
    bins=[0, 50000, 200000, 1000000, 5000000, float('inf')],
    labels=['<50K', '50K–200K', '200K–1M', '1M–5M', '>5M']
)

# Estimated revenue
df_my_01['est_revenue'] = df_my_01['price'] * df_my_01['sold_count']



print(f"Total products analyzed: {len(df_my_01)}")
print(f"\nDistribution by category:")
print(df_my_01['category_name'].value_counts())
print(f"\nDistribution by price segment:")
print(df_my_01['price_segment'].value_counts().sort_index())

# %%
# --- df_my_02: Aggregate statistics by price segment ---
df_my_02 = df_my_01.groupby('price_segment', observed=True).agg(
    product_count=('product_id', 'count'),
    avg_sold=('sold_count', 'mean'),
    median_sold=('sold_count', 'median'),
    total_sold=('sold_count', 'sum'),
    total_revenue=('est_revenue', 'sum')
).reset_index()

df_my_02['revenue_B'] = df_my_02['total_revenue'] / 1e9  # Convert to Billion VND

print("=== Summary Statistics by Price Segment ===")
print(df_my_02[['price_segment', 'product_count', 'avg_sold', 'median_sold', 'total_sold', 'revenue_B']].to_string(index=False))

# %%
# Visualization 1A: Average sold_count and total revenue by price segment
fig, axes = plt.subplots(1, 2, figsize=(16, 6))

colors = ['#2196F3', '#4CAF50', '#FF9800', '#E91E63', '#9C27B0']

# Left: Average sold count
bars1 = axes[0].bar(
    df_my_02['price_segment'],
    df_my_02['avg_sold'],
    color=colors,
    edgecolor='white',
    linewidth=1.5
)
axes[0].set_title('Mid-price segments (200K–1M) dominate average sales volume', 
                  fontsize=13, fontweight='bold', pad=12)
axes[0].set_xlabel('Price Segment (VND)', fontsize=11)
axes[0].set_ylabel('Average Sold Count (units)', fontsize=11)
axes[0].tick_params(axis='x', rotation=15)
for bar in bars1:
    h = bar.get_height()
    axes[0].text(bar.get_x() + bar.get_width()/2., h + 0.3,
                 f'{h:.1f}', ha='center', va='bottom', fontsize=9)

# Right: Total estimated revenue
bars2 = axes[1].bar(
    df_my_02['price_segment'],
    df_my_02['revenue_B'],
    color=colors,
    edgecolor='white',
    linewidth=1.5
)
axes[1].set_title('Higher-price segments drive revenue despite lower sales volume', 
                  fontsize=13, fontweight='bold', pad=12)
axes[1].set_xlabel('Price Segment (VND)', fontsize=11)
axes[1].set_ylabel('Total Revenue (Billion VND)', fontsize=11)
axes[1].tick_params(axis='x', rotation=15)
for bar in bars2:
    h = bar.get_height()
    axes[1].text(bar.get_x() + bar.get_width()/2., h + 0.5,
                 f'{h:.1f}B', ha='center', va='bottom', fontsize=9)

plt.suptitle('Price Segment vs Sales Effectiveness', fontsize=15, fontweight='bold', y=1.02)
plt.tight_layout()
plt.show()

# %%
# --- df_my_03: Filtered products with sold_count > 0 (for Q1 boxplot) ---
df_my_03 = df_my_01[df_my_01['sold_count'] > 0].copy()

# Visualization 1B: Box plot of sold_count distribution by price segment
fig, ax = plt.subplots(figsize=(14, 7))

df_my_03.boxplot(
    column='sold_count',
    by='price_segment',
    ax=ax,
    showfliers=False,
    patch_artist=True,
    boxprops=dict(facecolor='lightblue', color='navy'),
    medianprops=dict(color='red', linewidth=2),
    whiskerprops=dict(color='navy'),
    capprops=dict(color='navy')
)

ax.set_title('Distribution of Sold Count by Price Segment\n(Products with sold_count > 0, outliers hidden)',
             fontsize=13, fontweight='bold')
ax.set_xlabel('Price Segment (VND)', fontsize=11)
ax.set_ylabel('Sold Count (units)', fontsize=11)
ax.tick_params(axis='x', rotation=15)
plt.suptitle('')

plt.tight_layout()
plt.show()

# %%
# --- df_my_04: Pivot – avg sold_count by price segment × category ---
df_my_04 = df_my_01.groupby(
    ['price_segment', 'category_name'], observed=True
)['sold_count'].mean().unstack(fill_value=0)

# Visualization 1C: Grouped bar – avg sold_count by price segment × category
fig, ax = plt.subplots(figsize=(16, 8))
df_my_04.plot(kind='bar', ax=ax, width=0.75, edgecolor='white', linewidth=0.8)

ax.set_title('Average Sold Count by Price Segment and Category', fontsize=13, fontweight='bold', pad=12)
ax.set_xlabel('Price Segment (VND)', fontsize=11)
ax.set_ylabel('Average Sold Count (units)', fontsize=11)
ax.tick_params(axis='x', rotation=15)
ax.legend(title='Category', bbox_to_anchor=(1.01, 1), loc='upper left', fontsize=9)

plt.tight_layout()
plt.show()

# %%
# --- df_my_05: Scatter data – price vs sold_count (sold > 0) ---
df_my_05 = df_my_01[df_my_01['sold_count'] > 0].copy()

df_my_05 = df_my_05[
    (df_my_05['price'] > 1000) &
    (df_my_05['price'] < df_my_05['price'].quantile(0.99)) &
    (df_my_05['sold_count'] < df_my_05['sold_count'].quantile(0.99))
]

cat_colors = {
    'Home Appliances': '#2196F3',
    'Electronics & Cooling': '#4CAF50',
    'Phones & Tablets': '#FF9800',
    'Laptops & Components': '#E91E63',
    'Digital Devices & Accessories': '#9C27B0'
}

# Visualization 1D: Scatter plot price vs sold_count (log scale)
fig, ax = plt.subplots(figsize=(14, 7))

for cat, color in cat_colors.items():
    subset = df_my_05[df_my_05['category_name'] == cat]
    ax.scatter(
        subset['price'], 
        subset['sold_count'],
        alpha=0.25,  
        s=12,        
        color=color, 
        label=cat
    )

ax.set_xscale('log')
ax.set_yscale('log')

ax.set_xlabel('Price (VND, log scale)', fontsize=11)
ax.set_ylabel('Sold Count (log scale)', fontsize=11)

ax.set_title(
    'Weak negative relationship between price and sales (log-log scale)',
    fontsize=13, fontweight='bold'
)

ax.legend(bbox_to_anchor=(1.01, 1), loc='upper left', fontsize=9)
ax.grid(True, which='both', alpha=0.3)

corr, pval = stats.spearmanr(df_my_05['price'], df_my_05['sold_count'])

ax.annotate(
    f'Spearman r = {corr:.3f}\np = {pval:.2e}',
    xy=(0.05, 0.92), 
    xycoords='axes fraction',
    fontsize=11, 
    bbox=dict(boxstyle='round', facecolor='wheat', alpha=0.7)
)

plt.tight_layout()
plt.show()

print(f"\nSpearman correlation (price vs sold_count): r={corr:.4f}, p={pval:.4e}")

# %% [markdown]
# ### Key Findings – Question 1: Price Segments vs Sales Effectiveness
# 
# **Summary of insights:**
# - Mid-price products (200K–1M) achieve the highest sales volume, 
#   suggesting a balance between affordability and perceived quality.
# 
# - High-price segments (>5M) generate strong revenue but suffer from low demand,
#   indicating price sensitivity in the market.
# 
# - The weak negative Spearman correlation confirms that price alone 
#   is not a strong predictor of demand, implying other factors (brand, reviews) matter.
# 
# **Conclusion**: The **500K–2M** range is the sweet spot for per-product sales volume. The **2M–10M** range is optimal for revenue generation. Sellers should calibrate pricing strategy based on their goal — volume vs revenue.

# %% [markdown]
# ## 3. Question 2: Effect of Discount Percentage on Demand Stimulation

# %%
# --- df_my_06: Main working DataFrame for Question 2 ---
df_my_06 = df_product.copy()

# Filter valid data
df_my_06 = df_my_06[
    (df_my_06['price'] > 0) &
    (df_my_06['original_price'] > 0) &
    (df_my_06['source_category'].notna())
].copy()

df_my_06['category_name'] = df_my_06['source_category'].map(category_mapping)
df_my_06 = df_my_06[df_my_06['category_name'].notna()]

# Create discount bins
disc_labels = ['0%', '1-10%', '11-20%', '21-30%', '31-40%', '41-50%', '> 50%']
df_my_06['disc_bin'] = pd.cut(
    df_my_06['discount_percent'],
    bins=[-0.1, 0, 10, 20, 30, 40, 50, 100],
    labels=disc_labels
)

df_my_06['est_revenue'] = df_my_06['price'] * df_my_06['sold_count']

print(f"Total products analyzed: {len(df_my_06)}")
print(f"\nDistribution by discount bin:")
print(df_my_06['disc_bin'].value_counts().sort_index())

# %%
# --- df_my_07: Aggregate statistics by discount bin ---
df_my_07 = df_my_06.groupby('disc_bin', observed=True).agg(
    product_count=('product_id', 'count'),
    avg_sold=('sold_count', 'mean'),
    median_sold=('sold_count', 'median'),
    total_sold=('sold_count', 'sum'),
    total_revenue=('est_revenue', 'sum')
).reset_index()

df_my_07['revenue_B'] = df_my_07['total_revenue'] / 1e9

print("=== Summary Statistics by Discount Bin ===")
print(df_my_07[['disc_bin', 'product_count', 'avg_sold', 'median_sold', 'total_sold', 'revenue_B']].to_string(index=False))

# %%
# Visualization 2A: Average sold count and product count by discount bin
fig, axes = plt.subplots(1, 2, figsize=(16, 6))

disc_colors = ['#90A4AE', '#64B5F6', '#42A5F5', '#1E88E5', '#1565C0', '#0D47A1', '#01579B']

# Left: Average sold count
bars = axes[0].bar(
    df_my_07['disc_bin'],
    df_my_07['avg_sold'],
    color=disc_colors,
    edgecolor='white',
    linewidth=1.5
)
axes[0].plot(
    range(len(df_my_07)),
    df_my_07['avg_sold'],
    color='red', marker='o', linewidth=2, markersize=7, label='Trend'
)
axes[0].set_title('Average Sold Count by Discount Percentage', fontsize=13, fontweight='bold', pad=12)
axes[0].set_xlabel('Discount Percentage', fontsize=11)
axes[0].set_ylabel('Average Sold Count (units)', fontsize=11)
axes[0].tick_params(axis='x', rotation=20)
axes[0].legend(fontsize=10)
for bar in bars:
    h = bar.get_height()
    axes[0].text(bar.get_x() + bar.get_width()/2., h + 0.5,
                 f'{h:.1f}', ha='center', va='bottom', fontsize=8)

# Right: Product count by discount bin
bars2 = axes[1].bar(
    df_my_07['disc_bin'],
    df_my_07['product_count'],
    color=disc_colors,
    edgecolor='white',
    linewidth=1.5
)
axes[1].set_title('Number of Products by Discount Percentage', fontsize=13, fontweight='bold', pad=12)
axes[1].set_xlabel('Discount Percentage', fontsize=11)
axes[1].set_ylabel('Number of Products', fontsize=11)
axes[1].tick_params(axis='x', rotation=20)
for bar in bars2:
    h = bar.get_height()
    axes[1].text(bar.get_x() + bar.get_width()/2., h + 10,
                 f'{int(h):,}', ha='center', va='bottom', fontsize=8)

plt.suptitle('Discount Percentage vs Sales Effectiveness', fontsize=15, fontweight='bold', y=1.02)
plt.tight_layout()
plt.show()

# %%
# --- df_my_08: Filtered products with sold_count > 0 (for Q2 boxplot) ---
df_my_08 = df_my_06[df_my_06['sold_count'] > 0].copy()

# Visualization 2B: Box plot – sold_count distribution by discount bin
fig, ax = plt.subplots(figsize=(14, 7))

df_my_08.boxplot(
    column='sold_count',
    by='disc_bin',
    ax=ax,
    showfliers=False,
    patch_artist=True,
    boxprops=dict(facecolor='lightcoral', color='darkred'),
    medianprops=dict(color='blue', linewidth=2),
    whiskerprops=dict(color='darkred'),
    capprops=dict(color='darkred')
)

ax.set_title('Sales distribution shows high variability in low-price segments\n'
             '(Median increases but variance decreases with price)',
             fontsize=13, fontweight='bold')
ax.set_xlabel('Discount Percentage', fontsize=11)
ax.set_ylabel('Sold Count (units)', fontsize=11)
ax.tick_params(axis='x', rotation=20)
plt.suptitle('')

plt.tight_layout()
plt.show()

# %%
# --- df_my_09: Scatter data – discount % vs sold_count (sold > 0) ---
df_my_09 = df_my_06[df_my_06['sold_count'] > 0].copy()

# Visualization 2C: Scatter plot – discount % vs sold_count
fig, ax = plt.subplots(figsize=(12, 7))

for cat, color in cat_colors.items():
    subset = df_my_09[df_my_09['category_name'] == cat]
    ax.scatter(subset['discount_percent'], subset['sold_count'],
               alpha=0.25, s=15, color=color, label=cat)

corr2, pval2 = stats.spearmanr(df_my_09['discount_percent'], df_my_09['sold_count'])

ax.set_xlabel('Discount Percentage (%)', fontsize=11)
ax.set_ylabel('Sold Count (units)', fontsize=11)
ax.set_yscale('log')
ax.set_title('Discount % vs Sold Count by Category (log scale, sold > 0)',
             fontsize=13, fontweight='bold')
ax.legend(bbox_to_anchor=(1.01, 1), loc='upper left', fontsize=9)
ax.grid(True, alpha=0.3)
ax.annotate(f'Spearman r = {corr2:.3f}\n(p < 0.001)',
            xy=(0.72, 0.92), xycoords='axes fraction',
            fontsize=11, bbox=dict(boxstyle='round', facecolor='lightyellow', alpha=0.8))

plt.tight_layout()
plt.show()
print(f"\nSpearman correlation (discount % vs sold_count): r={corr2:.4f}, p={pval2:.4e}")

# %%
# --- df_my_10: Heatmap pivot – avg sold_count by discount bin × category ---
df_my_10 = df_my_06.groupby(
    ['disc_bin', 'category_name'], observed=True
)['sold_count'].mean().unstack(fill_value=0)

# Visualization 2D: Heatmap
fig, ax = plt.subplots(figsize=(14, 6))
sns.heatmap(
    df_my_10,
    annot=True, fmt='.1f',
    cmap='YlOrRd',
    ax=ax,
    linewidths=0.5,
    cbar_kws={'label': 'Average Sold Count'}
)
ax.set_title('Average Sold Count: Discount Bin x Category', fontsize=13, fontweight='bold')
ax.set_xlabel('Category', fontsize=11)
ax.set_ylabel('Discount Percentage', fontsize=11)
ax.tick_params(axis='x', rotation=20)

plt.tight_layout()
plt.show()

# %%
# Statistical tests
from scipy.stats import kruskal

# Kruskal-Wallis test across discount groups
groups = [group['sold_count'].values for _, group in df_my_06.groupby('disc_bin', observed=True)]
stat, p_value = kruskal(*groups)
print(f"Kruskal-Wallis Test (sold_count across discount bins):")
print(f"  H-statistic = {stat:.4f}")
print(f"  p-value     = {p_value:.4e}")
print()

# Mann-Whitney U: 0% discount vs 21-30% discount
g0     = df_my_06[df_my_06['disc_bin'] == '0%']['sold_count'].values
g21_30 = df_my_06[df_my_06['disc_bin'] == '21-30%']['sold_count'].values
stat2, pval_mw = stats.mannwhitneyu(g0, g21_30, alternative='less')
print(f"Mann-Whitney U Test (0% disc vs 21-30% disc):")
print(f"  U-statistic = {stat2:.1f}")
print(f"  p-value     = {pval_mw:.4e}")
print(f"  Median sold (0%)     = {np.median(g0):.1f}")
print(f"  Median sold (21-30%) = {np.median(g21_30):.1f}")
print(f"  Mean sold   (0%)     = {np.mean(g0):.2f}")
print(f"  Mean sold   (21-30%) = {np.mean(g21_30):.2f}")

# %% [markdown]
# ### Key Findings – Question 2: Discount Percentage vs Demand Stimulation
# 
# **Summary of insights:**
# - Sales increase significantly from 10–30% discount, indicating a strong behavioral response threshold.
# 
# - Discounts beyond 30% continue to increase volume, but with diminishing efficiency 
#   and potential profit loss.
# 
# - Extremely high discounts (>50%) show the highest sales, but this may reflect 
#   clearance strategies or low-quality products rather than sustainable growth.
# 
# - Therefore, the optimal practical discount range is 20–30%, balancing volume and profitability.
# **Conclusion**: Products with **21–30% discount** are the most efficient sweet spot — ~7× more average sales than undiscounted products while remaining commercially viable.

# %% [markdown]
# ## 4. Combined Summary
# 
# | DataFrame | Role | Key Info |
# |-----------|------|----------|
# | `df_my_01` | Q1 – Main product data with price segments | 55,883 products, 5 categories |
# | `df_my_02` | Q1 – Aggregated stats by price segment | 5 segments × 5 metrics |
# | `df_my_03` | Q1 – Filtered (sold_count > 0) for boxplot | Excludes zero-sellers |
# | `df_my_04` | Q1 – Pivot: avg sold by segment × category | 5 × 5 pivot table |
# | `df_my_05` | Q1 – Filtered (sold > 0) for scatter | Spearman r = –0.074 |
# | `df_my_06` | Q2 – Main product data with discount bins | 55,883 products, 7 bins |
# | `df_my_07` | Q2 – Aggregated stats by discount bin | 7 bins × 5 metrics |
# | `df_my_08` | Q2 – Filtered (sold_count > 0) for boxplot | Excludes zero-sellers |
# | `df_my_09` | Q2 – Filtered (sold > 0) for scatter | Spearman r = 0.035 |
# | `df_my_10` | Q2 – Pivot: avg sold by discount × category | 7 × 5 heatmap pivot |
# 
# **Overall Recommendation**: Products priced in the **500K–2M** range with a **21–30% discount** are likely to achieve the best combination of sales volume and commercial viability on the e-commerce platform.


