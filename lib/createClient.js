/*
 * _opts -> Object{
 *            connection_timeout -> Number,
 *                                   destroy connection on timeout,
 *                                   DEFAULT_TIMEOUT: 1000.
 *            logAction -> Function,
 *                                   if a log function is provided, the function
 *                                   will be called everytime a action is done
 *                                   with a object describing this action.
 *          }
 *
 * _contexts -> Object, store data table name and connection.
 *
 */
// 一个Client实例中只有 用户选项_opts 和 数据表_contexts，_contexts中存放的是 表名:Context对象
function Client(opts) {
    if (!(this instanceof Client)) {
        return new Client(opts)
    }
    this._opts = opts || {}
    //this._pool = opts.pool
    //this._database = opts.databasek
    this._contexts = {}
}

module.exports = Client

/*
 * table -> String or Array with strings.
 * config -> Object, config or interface.
        * var config1 = {
            type: 'mysql',
            config: {
                host: '1.1.1.1',
                database: 'db1'
                user: 'root',
                password: '',
            },
            readonly: true
        }
 */
// 把table名字与连接定义到Client实例中的_contexts中，_contexts中存放的是String: MysqlConnection 即 表名:Context对象
Client.prototype.define = function (table, config) {
    return new Promise(function (resolve, reject) {
            if (this._contexts[table]) {
                reject(new Error('table "' + table + '" is already defined'))
            }
            var definition
            if (config.__defined__) {
                definition = config
            } else {
                // 如果没有执行过define，会调用initDefine方法，此方法返回一个Context对象，并将__defined__设置为true
                definition = local.initDefine(config)
            }
            if (table.constructor === Array) {
                const that = this
                return table.forEach(function (t) {
                    that.define(t, definition)
                })
            this._contexts[table] = definition
            resolve()
        }
        
    })    
}
/*
 * options -> Object{
 *              user: '101, 23',
 *              actions: '*' or ['select', 'update']
 *            }
 */
// 根据options中的用户即操作，获取数据库连接对象，其中opts使用lodash惰性克隆，并从Client配置参数中获取timeout和logAction，
// 一并传递给Connection构造
// 调用getConnection时，除了配置权限外，还会调用_contexts中value(Context)中的getConnection方法从连接池中取出连接，封装成MysqlConnection返回
Client.prototype.getConnection = function (options) {
    return new Promise(function (resolve, reject) {
        try {
            var opts = $._.clone(options)
            opts.connection_timeout = this._opts.connection_timeout || DEFAULT_TIMEOUT
            opts.logAction = this._opts.logAction
            var conn = new Connection(this._contexts, opts)
            resolve(conn)
        }
        catch (e) {
            reject(e)
        }
    })    
}

const async = require('async')
const Connection = require('./Connection')
const $ = require('./$')
const DEFAULT_TIMEOUT = 1000

var local = {}
// 在Client中定义表时，要知道表的定义方式，目前支持default或mysql
// ret是一个Context对象，当调用Context.getConnection时，返回一个MysqlConnection对象，其封装了连接池中取出的连接。
local.initDefine = function (config) {
    var define = config.constructor === Object && config.type || 'default'
    var ret = new (require('./define/' + define).Context)(config)
    ret.__defined__ = true
    return ret
}

