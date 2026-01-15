import { Page, Layout, Card, BlockStack, Text, List, Banner, Divider, InlineStack, Badge, Box, Link } from "@shopify/polaris";

export default function CatalogDocsPage() {
  return (
    <Page
      title="How to Use Facebook Catalog"
      subtitle="Sync your products to Facebook and run powerful ads"
      fullWidth
    >
      <Layout>
        {/* What is it */}
        <Layout.Section>
          <Card>
            <BlockStack gap="400">
              <Text variant="headingLg" as="h2">
                🎯 What is Facebook Catalog?
              </Text>
              <Text as="p">
                Facebook Catalog lets you show your products in ads on Facebook and Instagram. 
                When someone visits your store but doesn't buy, you can automatically show them 
                the exact products they looked at in Facebook ads!
              </Text>
              <Text as="p">
                This is called "Dynamic Product Ads" and it's one of the most powerful ways to 
                bring customers back to complete their purchase.
              </Text>
              <Banner tone="info">
                <Text as="p" fontWeight="medium">
                  What you'll need:
                </Text>
                <List type="bullet">
                  <List.Item>A Facebook Business account (free to create)</List.Item>
                  <List.Item>Your Facebook Pixel connected (done in Dashboard)</List.Item>
                  <List.Item>Products in your Shopify store</List.Item>
                </List>
              </Banner>
            </BlockStack>
          </Card>
        </Layout.Section>

        {/* Method 1: Easy Way */}
        <Layout.Section>
          <Card>
            <BlockStack gap="500">
              <InlineStack align="space-between" blockAlign="center">
                <Text variant="headingLg" as="h2">
                  ✅ Easy Way: Automatic Sync
                </Text>
                <Badge tone="success">Recommended</Badge>
              </InlineStack>
              
              <Text as="p" tone="subdued">
                This is the fastest way. The app will automatically send your products to Facebook.
              </Text>

              <Divider />

              {/* Step 1 */}
              <BlockStack gap="300">
                <InlineStack gap="200" blockAlign="center">
                  <Box
                    background="bg-fill-info"
                    padding="200"
                    borderRadius="100"
                    minWidth="32px"
                  >
                    <Text as="p" variant="headingMd" alignment="center">1</Text>
                  </Box>
                  <Text variant="headingMd" as="h3">Connect Your Facebook Account</Text>
                </InlineStack>
                <List type="number">
                  <List.Item>Open the <strong>Dashboard</strong> page</List.Item>
                  <List.Item>Find the <strong>Facebook Settings</strong> section</List.Item>
                  <List.Item>Click <strong>"Get Facebook Token"</strong> - this opens Facebook</List.Item>
                  <List.Item>Log in to Facebook and allow the permissions</List.Item>
                  <List.Item>Copy the token that appears and paste it in the app</List.Item>
                  <List.Item>Enter your Facebook Pixel ID (find this in Facebook Events Manager)</List.Item>
                  <List.Item>Click <strong>Save</strong></List.Item>
                </List>
                <Banner tone="info">
                  <Text as="p">
                    <strong>Need help finding your Pixel ID?</strong> Go to{" "}
                    <Link url="https://business.facebook.com/events_manager2" external>
                      Facebook Events Manager
                    </Link>
                    , click on your pixel, and you'll see the ID at the top.
                  </Text>
                </Banner>
              </BlockStack>

              <Divider />

              {/* Step 2 */}
              <BlockStack gap="300">
                <InlineStack gap="200" blockAlign="center">
                  <Box
                    background="bg-fill-info"
                    padding="200"
                    borderRadius="100"
                    minWidth="32px"
                  >
                    <Text as="p" variant="headingMd" alignment="center">2</Text>
                  </Box>
                  <Text variant="headingMd" as="h3">Create Your Catalog</Text>
                </InlineStack>
                <Text as="p">Go to the <strong>Catalog</strong> page and choose one option:</Text>
                <List type="bullet">
                  <List.Item>
                    <strong>Create New Catalog:</strong> Type a name like "My Store Products" and click Create
                  </List.Item>
                  <List.Item>
                    <strong>Use Existing Catalog:</strong> If you already have a catalog in Facebook, select it from the list
                  </List.Item>
                </List>
                <Banner tone="warning">
                  <Text as="p">
                    <strong>Note:</strong> If you choose an existing catalog, your new products will be added to it. 
                    Any products with the same name will be updated.
                  </Text>
                </Banner>
              </BlockStack>

              <Divider />

              {/* Step 3 */}
              <BlockStack gap="300">
                <InlineStack gap="200" blockAlign="center">
                  <Box
                    background="bg-fill-info"
                    padding="200"
                    borderRadius="100"
                    minWidth="32px"
                  >
                    <Text as="p" variant="headingMd" alignment="center">3</Text>
                  </Box>
                  <Text variant="headingMd" as="h3">Choose Which Products to Sync</Text>
                </InlineStack>
                <Text as="p">You can choose:</Text>
                <List type="bullet">
                  <List.Item><strong>All Products</strong> - Send everything in your store</List.Item>
                  <List.Item><strong>Specific Collections</strong> - Only send products from certain collections</List.Item>
                  <List.Item><strong>In Stock Only</strong> - Only send products you have in stock</List.Item>
                </List>
                <Text as="p">Pick what makes sense for your ads!</Text>
              </BlockStack>

              <Divider />

              {/* Step 4 */}
              <BlockStack gap="300">
                <InlineStack gap="200" blockAlign="center">
                  <Box
                    background="bg-fill-info"
                    padding="200"
                    borderRadius="100"
                    minWidth="32px"
                  >
                    <Text as="p" variant="headingMd" alignment="center">4</Text>
                  </Box>
                  <Text variant="headingMd" as="h3">Sync Your Products</Text>
                </InlineStack>
                <List type="number">
                  <List.Item>Click the big <strong>"Sync Products Now"</strong> button</List.Item>
                  <List.Item>Wait a few minutes while the app sends your products to Facebook</List.Item>
                  <List.Item>You'll see a success message when it's done!</List.Item>
                </List>
                <Text as="p">The app will show you how many products were synced.</Text>
              </BlockStack>

              <Divider />

              {/* Step 5 */}
              <BlockStack gap="300">
                <InlineStack gap="200" blockAlign="center">
                  <Box
                    background="bg-fill-success"
                    padding="200"
                    borderRadius="100"
                    minWidth="32px"
                  >
                    <Text as="p" variant="headingMd" alignment="center">✓</Text>
                  </Box>
                  <Text variant="headingMd" as="h3">Check Facebook</Text>
                </InlineStack>
                <List type="number">
                  <List.Item>
                    Go to{" "}
                    <Link url="https://business.facebook.com/commerce" external>
                      Facebook Commerce Manager
                    </Link>
                  </List.Item>
                  <List.Item>Click on your catalog name</List.Item>
                  <List.Item>You should see all your products there!</List.Item>
                </List>
                <Banner tone="success">
                  <Text as="p">
                    <strong>Success!</strong> Your products are now in Facebook and ready to use in ads.
                  </Text>
                </Banner>
              </BlockStack>
            </BlockStack>
          </Card>
        </Layout.Section>

        {/* Method 2: Manual Way */}
        <Layout.Section>
          <Card>
            <BlockStack gap="500">
              <InlineStack align="space-between" blockAlign="center">
                <Text variant="headingLg" as="h2">
                  📋 Manual Way: Using a Feed Link
                </Text>
                <Badge>If you can't create catalogs</Badge>
              </InlineStack>
              
              <Text as="p" tone="subdued">
                Use this if someone else manages your Facebook Business account and you can't create catalogs yourself.
              </Text>

              <Divider />

              <BlockStack gap="300">
                <Text variant="headingMd" as="h3">Step 1: Get Your Feed Link</Text>
                <List type="number">
                  <List.Item>Go to the <strong>Catalog</strong> page in the app</List.Item>
                  <List.Item>Click the <strong>Product Feed</strong> tab at the top</List.Item>
                  <List.Item>Click <strong>Copy</strong> to copy your feed link</List.Item>
                </List>
                <Text as="p">This link contains all your product information.</Text>
              </BlockStack>

              <Divider />

              <BlockStack gap="300">
                <Text variant="headingMd" as="h3">Step 2: Send to Your Facebook Admin</Text>
                <Text as="p">Give this link to whoever manages your Facebook Business account. They will:</Text>
                <List type="number">
                  <List.Item>
                    Go to{" "}
                    <Link url="https://business.facebook.com/commerce" external>
                      Facebook Commerce Manager
                    </Link>
                  </List.Item>
                  <List.Item>Open your catalog</List.Item>
                  <List.Item>Click <strong>Data Sources</strong> then <strong>Add Items</strong></List.Item>
                  <List.Item>Choose <strong>Data Feed</strong></List.Item>
                  <List.Item>Paste your feed link</List.Item>
                  <List.Item>Choose <strong>Daily</strong> for how often to update</List.Item>
                  <List.Item>Click <strong>Upload</strong></List.Item>
                </List>
              </BlockStack>

              <Divider />

              <BlockStack gap="300">
                <Text variant="headingMd" as="h3">Step 3: Wait for Facebook</Text>
                <Text as="p">Facebook will check your link and import your products. This usually takes 15-30 minutes.</Text>
                <Text as="p">After that, your products will update automatically every day!</Text>
              </BlockStack>
            </BlockStack>
          </Card>
        </Layout.Section>

        {/* What gets synced */}
        <Layout.Section>
          <Card>
            <BlockStack gap="400">
              <Text variant="headingLg" as="h2">
                📦 What Information Gets Sent to Facebook
              </Text>
              <Text as="p">For each product, we send:</Text>
              <List type="bullet">
                <List.Item><strong>Product name and description</strong> - So people know what it is</List.Item>
                <List.Item><strong>Photos</strong> - Your main photo plus up to 9 more</List.Item>
                <List.Item><strong>Price</strong> - Regular price and sale price if you have one</List.Item>
                <List.Item><strong>Stock status</strong> - Whether it's in stock or sold out</List.Item>
                <List.Item><strong>Product details</strong> - Like color, size, brand</List.Item>
                <List.Item><strong>Link to your store</strong> - So people can click and buy</List.Item>
              </List>
              <Banner tone="success">
                <Text as="p">
                  <strong>Good news!</strong> When you change prices or add new products in Shopify, 
                  they automatically update in Facebook too (usually within 24 hours).
                </Text>
              </Banner>
            </BlockStack>
          </Card>
        </Layout.Section>

        {/* Settings */}
        <Layout.Section>
          <Card>
            <BlockStack gap="400">
              <Text variant="headingLg" as="h2">
                ⚙️ Settings You Can Change
              </Text>
              
              <BlockStack gap="300">
                <Text variant="headingMd" as="h3">How Often to Update</Text>
                <List type="bullet">
                  <List.Item><strong>Daily</strong> - Updates every day (best if you change prices often)</List.Item>
                  <List.Item><strong>Weekly</strong> - Updates once a week (good for stable stores)</List.Item>
                  <List.Item><strong>Manual</strong> - Only updates when you click the sync button</List.Item>
                </List>
                <Text as="p">We recommend Daily so your ads always show current prices and stock.</Text>
              </BlockStack>

              <Divider />

              <BlockStack gap="300">
                <Text variant="headingMd" as="h3">Other Options</Text>
                <List type="bullet">
                  <List.Item><strong>Include all product variants</strong> - Show each color/size as a separate item</List.Item>
                  <List.Item><strong>Include extra photos</strong> - Send up to 10 photos per product</List.Item>
                  <List.Item><strong>Track stock levels</strong> - Hide products when they're sold out</List.Item>
                </List>
              </BlockStack>
            </BlockStack>
          </Card>
        </Layout.Section>

        {/* Common Problems */}
        <Layout.Section>
          <Card>
            <BlockStack gap="500">
              <Text variant="headingLg" as="h2">
                🔧 Common Problems & Solutions
              </Text>

              <BlockStack gap="300">
                <Text variant="headingMd" as="h3">Problem: "Missing Permission" Error</Text>
                <Text as="p"><strong>What it means:</strong> Your Facebook token doesn't have the right permissions.</Text>
                <Text as="p"><strong>How to fix it:</strong></Text>
                <List type="number">
                  <List.Item>Go back to the Dashboard</List.Item>
                  <List.Item>Click "Get Facebook Token" again</List.Item>
                  <List.Item>Make sure you allow ALL permissions Facebook asks for</List.Item>
                  <List.Item>Copy the new token and save it</List.Item>
                </List>
              </BlockStack>

              <Divider />

              <BlockStack gap="300">
                <Text variant="headingMd" as="h3">Problem: "No Business Account Found"</Text>
                <Text as="p"><strong>What it means:</strong> You need a Facebook Business account first.</Text>
                <Text as="p"><strong>How to fix it:</strong></Text>
                <List type="number">
                  <List.Item>
                    Go to{" "}
                    <Link url="https://business.facebook.com" external>
                      business.facebook.com
                    </Link>
                  </List.Item>
                  <List.Item>Click "Create Account" (it's free!)</List.Item>
                  <List.Item>Follow the steps to set up your business</List.Item>
                  <List.Item>Come back and try again</List.Item>
                </List>
              </BlockStack>

              <Divider />

              <BlockStack gap="300">
                <Text variant="headingMd" as="h3">Problem: Products Not Showing Up</Text>
                <Text as="p"><strong>What to check:</strong></Text>
                <List type="bullet">
                  <List.Item>Are your products set to "Active" in Shopify? (not Draft)</List.Item>
                  <List.Item>Do your products have photos and prices?</List.Item>
                  <List.Item>Did you wait a few minutes? It can take 5-10 minutes</List.Item>
                  <List.Item>Check Facebook Commerce Manager for any error messages</List.Item>
                </List>
              </BlockStack>

              <Divider />

              <BlockStack gap="300">
                <Text variant="headingMd" as="h3">Problem: Prices Are Wrong in Facebook</Text>
                <Text as="p"><strong>How to fix it:</strong></Text>
                <List type="bullet">
                  <List.Item>Go to the Catalog page</List.Item>
                  <List.Item>Click "Sync Products Now" to update everything</List.Item>
                  <List.Item>Wait 5 minutes and check Facebook again</List.Item>
                </List>
              </BlockStack>
            </BlockStack>
          </Card>
        </Layout.Section>

        {/* Tips */}
        <Layout.Section>
          <Card>
            <BlockStack gap="400">
              <Text variant="headingLg" as="h2">
                💡 Tips for Better Results
              </Text>

              <BlockStack gap="300">
                <Text variant="headingMd" as="h3">1. Use Good Photos</Text>
                <List type="bullet">
                  <List.Item>Use clear, high-quality product photos</List.Item>
                  <List.Item>Show the product from different angles</List.Item>
                  <List.Item>Use a clean white or simple background</List.Item>
                  <List.Item>Make sure photos are at least 1000x1000 pixels</List.Item>
                </List>
              </BlockStack>

              <Divider />

              <BlockStack gap="300">
                <Text variant="headingMd" as="h3">2. Write Clear Descriptions</Text>
                <List type="bullet">
                  <List.Item>Use simple, clear product names</List.Item>
                  <List.Item>Include important details like size, color, material</List.Item>
                  <List.Item>Write descriptions that help people understand what they're buying</List.Item>
                </List>
              </BlockStack>

              <Divider />

              <BlockStack gap="300">
                <Text variant="headingMd" as="h3">3. Keep Everything Updated</Text>
                <List type="bullet">
                  <List.Item>Set sync to <strong>Daily</strong> if you change prices often</List.Item>
                  <List.Item>Remove products you don't sell anymore</List.Item>
                  <List.Item>Update stock levels in Shopify regularly</List.Item>
                </List>
              </BlockStack>

              <Divider />

              <BlockStack gap="300">
                <Text variant="headingMd" as="h3">4. Make Sure Your Pixel is Working</Text>
                <Text as="p">Your Facebook Pixel should track when people:</Text>
                <List type="bullet">
                  <List.Item>View a product page</List.Item>
                  <List.Item>Add something to cart</List.Item>
                  <List.Item>Start checkout</List.Item>
                  <List.Item>Complete a purchase</List.Item>
                </List>
                <Text as="p">This helps Facebook show your ads to the right people!</Text>
              </BlockStack>
            </BlockStack>
          </Card>
        </Layout.Section>

        {/* Creating Ads */}
        <Layout.Section>
          <Card>
            <BlockStack gap="500">
              <Text variant="headingLg" as="h2">
                🎯 How to Create Ads with Your Catalog
              </Text>
              <Text as="p">Now that your products are in Facebook, here's how to create ads:</Text>

              <BlockStack gap="300">
                <Text variant="headingMd" as="h3">Step 1: Group Your Products</Text>
                <List type="number">
                  <List.Item>Go to Facebook Commerce Manager</List.Item>
                  <List.Item>Click on your catalog</List.Item>
                  <List.Item>Click <strong>Product Sets</strong> then <strong>Create Set</strong></List.Item>
                  <List.Item>Choose which products to include (like "All products under $50" or "Summer collection")</List.Item>
                  <List.Item>Save your product set</List.Item>
                </List>
                <Text as="p">Product sets help you organize products for different ad campaigns.</Text>
              </BlockStack>

              <Divider />

              <BlockStack gap="300">
                <Text variant="headingMd" as="h3">Step 2: Create Your Ad Campaign</Text>
                <List type="number">
                  <List.Item>Go to Facebook Ads Manager</List.Item>
                  <List.Item>Click <strong>Create</strong> to make a new campaign</List.Item>
                  <List.Item>Choose <strong>Sales</strong> as your goal</List.Item>
                  <List.Item>Select <strong>Catalog Sales</strong></List.Item>
                  <List.Item>Pick your catalog and product set</List.Item>
                  <List.Item>Choose who you want to show ads to</List.Item>
                  <List.Item>Set your daily budget</List.Item>
                  <List.Item>Create your ad (Facebook will use your product photos and info!)</List.Item>
                </List>
              </BlockStack>

              <Divider />

              <BlockStack gap="300">
                <Text variant="headingMd" as="h3">Step 3: Show Ads to the Right People</Text>
                <Text as="p">You can show ads to people who:</Text>
                <List type="bullet">
                  <List.Item><strong>Viewed products</strong> but didn't buy</List.Item>
                  <List.Item><strong>Added to cart</strong> but didn't checkout</List.Item>
                  <List.Item><strong>Bought before</strong> and might buy again</List.Item>
                </List>
                <Banner tone="success">
                  <Text as="p">
                    <strong>Pro tip:</strong> Showing ads to people who already visited your store 
                    works really well because they already know your products!
                  </Text>
                </Banner>
              </BlockStack>
            </BlockStack>
          </Card>
        </Layout.Section>

        {/* FAQ */}
        <Layout.Section>
          <Card>
            <BlockStack gap="400">
              <Text variant="headingLg" as="h2">
                ❓ Common Questions
              </Text>

              <BlockStack gap="300">
                <Text variant="headingMd" as="h3">How many products can I add?</Text>
                <Text as="p">You can sync up to 5,000 products at once. If you have more, contact us for help!</Text>
              </BlockStack>

              <Divider />

              <BlockStack gap="300">
                <Text variant="headingMd" as="h3">How long does it take?</Text>
                <Text as="p">Usually 2-5 minutes for most stores. Larger stores might take 10-15 minutes.</Text>
              </BlockStack>

              <Divider />

              <BlockStack gap="300">
                <Text variant="headingMd" as="h3">Do I need to sync again when I add new products?</Text>
                <Text as="p">
                  If you set sync to "Daily", new products will automatically appear in Facebook the next day. 
                  Or you can click "Sync Products Now" to update immediately.
                </Text>
              </BlockStack>

              <Divider />

              <BlockStack gap="300">
                <Text variant="headingMd" as="h3">What if I delete a product in Shopify?</Text>
                <Text as="p">
                  It will stay in Facebook until the next sync. Then it will be removed automatically.
                </Text>
              </BlockStack>

              <Divider />

              <BlockStack gap="300">
                <Text variant="headingMd" as="h3">Can I have multiple catalogs?</Text>
                <Text as="p">
                  Right now, you can connect one catalog per app. If you need multiple catalogs, 
                  you can create different product sets within one catalog.
                </Text>
              </BlockStack>

              <Divider />

              <BlockStack gap="300">
                <Text variant="headingMd" as="h3">Do I need a Facebook Shop?</Text>
                <Text as="p">
                  No! The catalog works for ads even if you don't have a Facebook Shop. 
                  But you can use the same catalog for both if you want.
                </Text>
              </BlockStack>

              <Divider />

              <BlockStack gap="300">
                <Text variant="headingMd" as="h3">Can I choose which products to sync?</Text>
                <Text as="p">
                  Yes! You can sync all products, only certain collections, or only products that are in stock.
                </Text>
              </BlockStack>
            </BlockStack>
          </Card>
        </Layout.Section>

        {/* Support */}
        <Layout.Section>
          <Card>
            <BlockStack gap="300">
              <Text variant="headingLg" as="h2">
                💬 Need More Help?
              </Text>
              <Text as="p">If you're stuck or have questions:</Text>
              <List type="bullet">
                <List.Item>
                  Check out{" "}
                  <Link url="https://www.facebook.com/business/help/1275400645914358" external>
                    Facebook's Catalog Help Center
                  </Link>
                </List.Item>
                <List.Item>
                  Learn about{" "}
                  <Link url="https://www.facebook.com/business/help/455326144628161" external>
                    Dynamic Product Ads
                  </Link>
                </List.Item>
                <List.Item>Contact our support team - we're here to help!</List.Item>
              </List>
              <Banner tone="success">
                <Text as="p">
                  <strong>You're all set!</strong> Once your catalog is synced, you can start creating 
                  powerful ads that bring customers back to your store. Good luck with your campaigns! 🚀
                </Text>
              </Banner>
            </BlockStack>
          </Card>
        </Layout.Section>
      </Layout>
    </Page>
  );
}
