from flask import Flask, request, abort, jsonify

app = Flask(__name__)


@app.route('/<path:path>', methods=['POST', 'DELETE', 'PUT', 'GET'])
def auth(path):
    # authentication
    auth = request.authorization
    if not hasattr(auth, 'username') or not hasattr(auth, 'password'):
        return authn_fail()

    username = auth.username
    password = auth.password
    priority_header = request.headers.get('x-request-priority')
    print('username =', username, ', password =',
          password, ', priority =', priority_header)

    if username != 'testClient' or password != 'secret':
        return authn_fail()

    # authorization
    if path == 'anything/protected' and request.method != 'GET':
        return authz_fail()

    # pass header to upstream
    if priority_header:
        priority = int(priority_header)
    else:
        priority = 0

    if priority > 100:
        priority_level_header = 'high'
    else:
        priority_level_header = 'low'
    response_headers = [('x-auth-client-id', username),
                        ('x-auth-priority-level', priority_level_header)]

    return 'OK', response_headers


def authn_fail():
    return 'Unauthorized', 401

def authz_fail():
    return 'Forbidden', 403


if __name__ == '__main__':
    app.run(debug=True, host='0.0.0.0')
