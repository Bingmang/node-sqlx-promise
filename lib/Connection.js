/*
 * options -> Object{
 *              user: '101, 23',
 *              actions: '*' or ['select', 'update'],
 *              connection_timeout: 1000,
 *              logAction: Function
 *            }
 */
// 为连接配置权限，根据actions为Connection.prototype赋与不同的Function
function Connection(contexts, opts) {
    this._contexts = contexts
    this._opts = opts
    this._allowed_actions = {
    }
    if (opts.actions) {
        var allowed
        if (opts.actions === '*') {
            allowed = $.ALL_METHODS
        } else {
            allowed = opts.actions
        }
        // 在_allowed_actions中标记可以执行的操作为true
        allowed.forEach(action => this._allowed_actions[action] = true)
        if (this._allowed_actions.select) {
            this._allowed_actions.queryReadonly = true
            this._allowed_actions.selectEx = true
        }
        this._allowed_actions.release = true
    }
}
module.exports = Connection

const $ = require('./$')

function logActionInternal(logAction, start_time, table, method, args) {
    if (!$.util.isFunction(logAction)) {
        return
    }
    logAction({
        table: table,
        method: method,
        duration: new Date() - start_time,
        // remove callback function
        args: $._.pickBy(args, x => !$.util.isFunction(x)),
    })
}

// 定义 Client.prototype.select, Client.prototype.delete ... 每个要求的参数数量都不一样，在mysql.js中定义了，但在这没定义
// this -> Connection
$.ALL_METHODS.forEach(function (method) {
    // MysqlConnection.prototype.* 第一个参数一定是table，后面参数不定，但最后一个参数一定是callback
    // 例如： conn.insert(table, set, where, callback)
    Connection.prototype[method] = function (table) {
        // 由于后面的操作要将arguments的最后一个参数进行callback修改，所以要把用户的callback保存下来
        const callback = arguments[arguments.length - 1]
        // 使用done来标记连接是否被催毁
        var done = false
        // 对于不允许的操作初始化成会callback error的操作
        if (!this._allowed_actions[method]) {
            return callback(new Error(
                `action "${method}" not allowed for user ${this._opts.user}`))
        }
        // TODO
        // $.ALL_METHODS[1] == update, $.ALL_METHODS[2] == delete?
        // delete->1, update->2
        var where_pos = local.PARAM_WHERE_POSITION[method]
        if (where_pos !== undefined
            && !local.assureNoUndefined(arguments[where_pos])) {
            return callback(new Error('undefined value not allowed: '
                + $.util.inspect(arguments[where_pos])))
        }
        // 检测callback是否有效
        if (callback.constructor !== Function) {
            throw new Error('missing callback')
        }
        // TODO
        // 如果要操作的table存在，则指定table，否则指定所有table?
        var table_def
        if (this._contexts[table]) {
            table_def = table
        } else {
            table_def = '*'
        }
        // TODO
        // 为什么要再判断一遍表是否存在呢，不存在的话经过上面的处理table_def不是等于'*'了吗
        if (!this._contexts[table_def]) {
            var e = new Error(table + ' is not defined')
            return callback(e)
        }
        // 开始初始化成员 从mysql.js通过getConnection从连接池中获取连接，并封装成MysqlConnection对象返回给conn
        const context = this._contexts[table_def]
        const conn = context.getConnection()
        const timeout_destroy = setTimeout(() => {
            done = true
            conn.__destroy()
            callback(new Error('connection timeout.'))
        }, this._opts.connection_timeout)

        const start_time = +new Date()
        const that = this
        const args = arguments
        // 将arguments的最后一个参数定义为新callback，做后续处理，方便传递给conn[method]，然后最后执行用户自己的callback
        arguments[arguments.length - 1] = function () {
            // 检测用户是否定义了logAction函数
            if (that._opts && $.util.isFunction(that._opts.logAction)) {
                // queryReadonly do not has table parameter
                var table_name = method != 'queryReadonly' ? table : '-'
                logActionInternal(that._opts.logAction, start_time, table_name, method,
                    args)
            }
            if (done) {
                // timeouted
                return
            }
            conn.release()
            clearTimeout(timeout_destroy)
            callback.apply(null, arguments)
        }
        // 真正调用mysql.js中的方法(MysqlConnection.prototype.insert, update, delete...)
        conn[method].apply(conn, arguments)
    }
})

Connection.prototype.timeout = function (timeout) {
    $.ALL_METHODS.forEach(function (method) {
        Connection.prototype[method] = function (args) {
            setTimeout(Connection.prototype[method](args), timeout)
        }
    })
}

Connection.prototype.release = function () {
    return
}

var local = {}

// 判断一个对象是否真的是已经定义过的对象
local.assureNoUndefined = (obj) => {
    if (obj === undefined) {
        return false
    }
    if (!obj || obj.constructor !== Object) {
        return true
    }
    var keys = Object.keys(obj)
    for (var i in keys) {
        var v = obj[keys[i]]
        // 对象中的值如果是空对象的话也会返回false
        if (!local.assureNoUndefined(v)) {
            return false
        }
    }
    return true
}

// TODO
// 可是$中定义的delete是2，update是1
local.PARAM_WHERE_POSITION = {
    delete: 1,
    update: 2,
}
