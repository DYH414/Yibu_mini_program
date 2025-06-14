// 云函数入口文件
const cloud = require('wx-server-sdk')

cloud.init({
    env: 'cloudbase-0gdnnqax782f54fa'
})

// 云函数入口函数
exports.main = async (event, context) => {
    const db = cloud.database()
    const _ = db.command
    const merchantsCollection = db.collection('merchants')

    // 分类映射表
    const categoryMapping = {
        '快餐': 'fast-food',
        '小吃': 'snack',
        '汉堡': 'burger',
        '奶茶': 'milk-tea',
        '外卖平台': 'delivery-platform',
        '其他': 'other'
    }

    try {
        // 获取所有商家
        const merchants = await merchantsCollection.get()
        console.log('获取到商家数据:', merchants.data.length, '条')

        // 记录修复结果
        const results = {
            success: [],
            failed: [],
            unchanged: []
        }

        // 遍历商家，检查并修复分类
        for (const merchant of merchants.data) {
            const currentCategory = merchant.category

            // 如果当前分类是中文，需要转换为英文ID
            if (categoryMapping[currentCategory]) {
                try {
                    // 更新商家分类
                    await merchantsCollection.doc(merchant._id).update({
                        data: {
                            category: categoryMapping[currentCategory]
                        }
                    })

                    console.log(`商家 ${merchant.name} 分类从 ${currentCategory} 更新为 ${categoryMapping[currentCategory]}`)
                    results.success.push({
                        id: merchant._id,
                        name: merchant.name,
                        oldCategory: currentCategory,
                        newCategory: categoryMapping[currentCategory]
                    })
                } catch (err) {
                    console.error(`更新商家 ${merchant.name} 分类失败:`, err)
                    results.failed.push({
                        id: merchant._id,
                        name: merchant.name,
                        category: currentCategory,
                        error: err
                    })
                }
            } else if (Object.values(categoryMapping).includes(currentCategory)) {
                // 分类已经是英文ID，无需修改
                console.log(`商家 ${merchant.name} 分类 ${currentCategory} 已正确，无需修改`)
                results.unchanged.push({
                    id: merchant._id,
                    name: merchant.name,
                    category: currentCategory
                })
            } else {
                // 分类不在映射表中，设为"其他"
                try {
                    await merchantsCollection.doc(merchant._id).update({
                        data: {
                            category: 'other'
                        }
                    })

                    console.log(`商家 ${merchant.name} 分类 ${currentCategory} 不在映射表中，已更新为 other`)
                    results.success.push({
                        id: merchant._id,
                        name: merchant.name,
                        oldCategory: currentCategory,
                        newCategory: 'other'
                    })
                } catch (err) {
                    console.error(`更新商家 ${merchant.name} 分类失败:`, err)
                    results.failed.push({
                        id: merchant._id,
                        name: merchant.name,
                        category: currentCategory,
                        error: err
                    })
                }
            }
        }

        return {
            success: true,
            results: results
        }
    } catch (err) {
        console.error('修复商家分类失败:', err)
        return {
            success: false,
            error: err
        }
    }
} 