// 云函数入口文件
const cloud = require('wx-server-sdk')

cloud.init({
    env: 'cloudbase-0gdnnqax782f54fa'
})

// 云函数入口函数
exports.main = async (event, context) => {
    const wxContext = cloud.getWXContext()
    const openid = wxContext.OPENID

    console.log('云函数login被调用, openid:', openid)

    const db = cloud.database()
    const userCollection = db.collection('users')

    try {
        // 查询用户是否已存在
        console.log('尝试查询用户:', openid)
        const user = await userCollection.doc(openid).get()
        console.log('用户已存在:', user.data)

        // 用户已存在，返回用户信息
        return {
            openid,
            user: user.data,
            isNew: false
        }
    } catch (err) {
        // 用户不存在，创建新用户
        console.log('用户不存在，创建新用户:', err)

        try {
            // 尝试创建新用户
            const userData = {
                nickname: '微信用户', // 默认昵称
                avatarUrl: '/images/default-avatar.png', // 默认头像
                createTime: db.serverDate()
            };

            // 使用add方法并指定_id
            await userCollection.add({
                data: {
                    _id: openid,
                    ...userData
                }
            });

            console.log('创建新用户成功');

            // 创建成功后，再次查询用户信息并返回
            const newUser = await userCollection.doc(openid).get();
            console.log('新用户信息:', newUser.data);

            return {
                openid,
                user: newUser.data,
                isNew: true
            }
        } catch (createErr) {
            console.error('创建新用户失败:', createErr);

            // 如果是因为用户已存在导致的错误，尝试再次获取用户信息
            if (createErr.errCode === -502001) {
                try {
                    const existingUser = await userCollection.doc(openid).get();
                    console.log('用户已存在，重新获取信息:', existingUser.data);

                    return {
                        openid,
                        user: existingUser.data,
                        isNew: false
                    };
                } catch (getErr) {
                    console.error('获取已存在用户信息失败:', getErr);
                }
            }

            return {
                openid,
                error: createErr,
                isNew: true
            }
        }
    }
} 