from flask import Flask, request, abort, jsonify

app = Flask(__name__)


@app.route('/auth', methods=['POST'])
def authenticate():
    auth = request.authorization
    if not hasattr(auth, 'username') or not hasattr(auth, 'password'):
        return authn_fail()

    username = auth.username
    password = auth.password
    priority_header = request.headers.get('x-request-priority')
    print('username =', username, ', password =', password, ', priority =', priority_header)

    if username != 'testClient' or password != 'secret':
        return authn_fail()

    if priority_header:
        priority = int(priority_header)
    else:
        priority = 0

    if priority > 100:
        authorized_header = 'true'
    else:
        authorized_header = 'false'

    response_headers = [('x-auth-client-id', username), ('x-auth-authorized', authorized_header)]
    return jsonify({'authenticated': True}), response_headers

def authn_fail():
    return jsonify({'authenticated': False}), 401

if __name__ == '__main__':
    app.run(debug=True, host="0.0.0.0")
